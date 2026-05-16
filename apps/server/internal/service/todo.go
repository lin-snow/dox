package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	maxTitleLen = 1024
	ulidLen     = 26
)

// Querier is the subset of queries.Queries used by TodoService. Defined here so
// tests can substitute an in-memory fake without spinning up SQLite.
type Querier interface {
	ListTodos(ctx context.Context) ([]queries.Todo, error)
	GetTodo(ctx context.Context, id string) (queries.Todo, error)
	CreateTodo(ctx context.Context, arg queries.CreateTodoParams) (queries.Todo, error)
	UpdateTodo(ctx context.Context, arg queries.UpdateTodoParams) (queries.Todo, error)
	DeleteTodo(ctx context.Context, id string) (int64, error)
	FindTodoIDsByPrefix(ctx context.Context, prefix sql.NullString) ([]string, error)
}

type TodoService struct {
	doxv1.UnimplementedTodoServiceServer
	q   Querier
	now func() int64
}

func NewTodoService(q Querier) *TodoService {
	return &TodoService{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *TodoService) ListTodos(ctx context.Context, _ *doxv1.ListTodosRequest) (*doxv1.ListTodosResponse, error) {
	rows, err := s.q.ListTodos(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list todos: %v", err)
	}
	todos := make([]*doxv1.Todo, 0, len(rows))
	for _, r := range rows {
		todos = append(todos, modelToProto(r))
	}
	return &doxv1.ListTodosResponse{Todos: todos}, nil
}

func (s *TodoService) GetTodo(ctx context.Context, req *doxv1.GetTodoRequest) (*doxv1.Todo, error) {
	id, err := s.resolveID(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	row, err := s.q.GetTodo(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Errorf(codes.NotFound, "todo %q not found", id)
		}
		return nil, status.Errorf(codes.Internal, "get todo: %v", err)
	}
	return modelToProto(row), nil
}

func (s *TodoService) CreateTodo(ctx context.Context, req *doxv1.CreateTodoRequest) (*doxv1.Todo, error) {
	title := strings.TrimSpace(req.GetTitle())
	if title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}
	if len(title) > maxTitleLen {
		return nil, status.Errorf(codes.InvalidArgument, "title exceeds %d bytes", maxTitleLen)
	}

	id := ulid.Make().String()
	now := s.now()
	row, err := s.q.CreateTodo(ctx, queries.CreateTodoParams{
		ID:        id,
		Title:     title,
		CreatedAt: now,
		UpdatedAt: now,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create todo: %v", err)
	}
	return modelToProto(row), nil
}

func (s *TodoService) UpdateTodo(ctx context.Context, req *doxv1.UpdateTodoRequest) (*doxv1.Todo, error) {
	id, err := s.resolveID(ctx, req.GetId())
	if err != nil {
		return nil, err
	}

	// Read-modify-write. SetMaxOpenConns(1) in db.Open serializes writers,
	// keeping the lost-update race window tiny at single-user scope; a real
	// transaction is overkill until multi-device support lands.
	existing, err := s.q.GetTodo(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Errorf(codes.NotFound, "todo %q not found", id)
		}
		return nil, status.Errorf(codes.Internal, "get todo: %v", err)
	}

	title := existing.Title
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			return nil, status.Error(codes.InvalidArgument, "title cannot be empty")
		}
		if len(t) > maxTitleLen {
			return nil, status.Errorf(codes.InvalidArgument, "title exceeds %d bytes", maxTitleLen)
		}
		title = t
	}

	done := existing.Done
	if req.Done != nil {
		done = btoi(*req.Done)
	}

	row, err := s.q.UpdateTodo(ctx, queries.UpdateTodoParams{
		Title:     title,
		Done:      done,
		UpdatedAt: s.now(),
		ID:        id,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update todo: %v", err)
	}
	return modelToProto(row), nil
}

func (s *TodoService) DeleteTodo(ctx context.Context, req *doxv1.DeleteTodoRequest) (*doxv1.DeleteTodoResponse, error) {
	id, err := s.resolveID(ctx, req.GetId())
	if err != nil {
		return nil, err
	}
	n, err := s.q.DeleteTodo(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete todo: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "todo %q not found", id)
	}
	return &doxv1.DeleteTodoResponse{}, nil
}

// resolveID normalizes a raw input (full ULID or prefix) into the canonical
// 26-char ULID. ULIDs are case-insensitive per Crockford Base32, so we
// upper-case the input before any DB lookup.
//
// Returns InvalidArgument for empty / too-long input, NotFound when no todo
// matches the prefix, FailedPrecondition when a short prefix matches multiple.
func (s *TodoService) resolveID(ctx context.Context, raw string) (string, error) {
	if raw == "" {
		return "", status.Error(codes.InvalidArgument, "id is required")
	}
	normalized := strings.ToUpper(raw)
	if len(normalized) > ulidLen {
		return "", status.Errorf(codes.InvalidArgument, "id too long (%d > %d)", len(normalized), ulidLen)
	}
	if len(normalized) == ulidLen {
		return normalized, nil
	}

	matches, err := s.q.FindTodoIDsByPrefix(ctx, sql.NullString{String: normalized, Valid: true})
	if err != nil {
		return "", status.Errorf(codes.Internal, "resolve prefix: %v", err)
	}
	switch len(matches) {
	case 0:
		return "", status.Errorf(codes.NotFound, "no todo matches prefix %q", raw)
	case 1:
		return matches[0], nil
	default:
		return "", status.Errorf(codes.FailedPrecondition, "prefix %q matches multiple todos — specify more characters", raw)
	}
}

func modelToProto(t queries.Todo) *doxv1.Todo {
	return &doxv1.Todo{
		Id:        t.ID,
		Title:     t.Title,
		Done:      t.Done != 0,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

func btoi(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

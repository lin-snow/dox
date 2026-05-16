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

const maxTitleLen = 1024

// Querier is the subset of queries.Queries used by TodoService, defined here so
// tests can substitute an in-memory fake without spinning up SQLite.
type Querier interface {
	ListTodos(ctx context.Context) ([]queries.Todo, error)
	GetTodo(ctx context.Context, id string) (queries.Todo, error)
	CreateTodo(ctx context.Context, arg queries.CreateTodoParams) (queries.Todo, error)
	UpdateTodo(ctx context.Context, arg queries.UpdateTodoParams) (queries.Todo, error)
	DeleteTodo(ctx context.Context, id string) (int64, error)
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
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	row, err := s.q.GetTodo(ctx, req.GetId())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Errorf(codes.NotFound, "todo %q not found", req.GetId())
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
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	// Read-modify-write under a single connection (SetMaxOpenConns(1) in db.Open
	// effectively serializes writers, so the lost-update race window stays tiny
	// for single-user dox; a real transaction is overkill until multi-device.)
	existing, err := s.q.GetTodo(ctx, req.GetId())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Errorf(codes.NotFound, "todo %q not found", req.GetId())
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
		ID:        req.GetId(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "update todo: %v", err)
	}
	return modelToProto(row), nil
}

func (s *TodoService) DeleteTodo(ctx context.Context, req *doxv1.DeleteTodoRequest) (*doxv1.DeleteTodoResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	n, err := s.q.DeleteTodo(ctx, req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete todo: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "todo %q not found", req.GetId())
	}
	return &doxv1.DeleteTodoResponse{}, nil
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

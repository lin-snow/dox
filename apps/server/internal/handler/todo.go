package handler

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
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	maxTitleLen = 1024
	ulidLen     = 26

	// projectInbox is the magic value clients send in ListTodosRequest.project_id
	// to filter to the caller's Inbox (project_id IS NULL in the DB).
	projectInbox = "inbox"
)

// Todo implements TodoService.
//
// Visibility rules:
//   - Inbox todo (project_id NULL) is visible only to its created_by.
//   - Project todo is visible to project owner + members.
//   - Mutations require owner or editor; viewers are read-only.
type Todo struct {
	doxv1.UnimplementedTodoServiceServer
	q   *queries.Queries
	now func() int64
}

func NewTodo(q *queries.Queries) *Todo {
	return &Todo{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Todo) ListTodos(ctx context.Context, req *doxv1.ListTodosRequest) (*doxv1.ListTodosResponse, error) {
	c := caller.MustFrom(ctx)
	var rows []queries.Todo
	switch {
	case req.ProjectId == nil:
		r, err := s.q.ListTodosForUser(ctx, c.UserID)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list todos: %v", err)
		}
		rows = r
	case *req.ProjectId == projectInbox:
		r, err := s.q.ListInboxTodos(ctx, c.UserID)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list inbox: %v", err)
		}
		rows = r
	default:
		if err := authz.CanReadProject(ctx, s.q, c.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		r, err := s.q.ListTodosInProject(ctx, sql.NullString{String: *req.ProjectId, Valid: true})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list project todos: %v", err)
		}
		rows = r
	}
	todos := make([]*doxv1.Todo, 0, len(rows))
	for _, r := range rows {
		todos = append(todos, todoToProto(r))
	}
	return &doxv1.ListTodosResponse{Todos: todos}, nil
}

func (s *Todo) GetTodo(ctx context.Context, req *doxv1.GetTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}
	row, err := s.q.GetTodo(ctx, id)
	if err != nil {
		return nil, translateGetTodoErr(err, id)
	}
	if err := s.assertVisible(ctx, c.UserID, row); err != nil {
		return nil, err
	}
	return todoToProto(row), nil
}

func (s *Todo) CreateTodo(ctx context.Context, req *doxv1.CreateTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	title := strings.TrimSpace(req.GetTitle())
	if title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}
	if len(title) > maxTitleLen {
		return nil, status.Errorf(codes.InvalidArgument, "title exceeds %d bytes", maxTitleLen)
	}

	var projectID sql.NullString
	if req.ProjectId != nil && *req.ProjectId != "" {
		if err := authz.CanWriteProjectTodos(ctx, s.q, c.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		projectID = sql.NullString{String: *req.ProjectId, Valid: true}
	}

	id := ulid.Make().String()
	now := s.now()
	row, err := s.q.CreateTodo(ctx, queries.CreateTodoParams{
		ID:        id,
		Title:     title,
		ProjectID: projectID,
		CreatedBy: c.UserID,
		CreatedAt: now,
		UpdatedAt: now,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create todo: %v", err)
	}
	return todoToProto(row), nil
}

func (s *Todo) UpdateTodo(ctx context.Context, req *doxv1.UpdateTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}
	existing, err := s.q.GetTodo(ctx, id)
	if err != nil {
		return nil, translateGetTodoErr(err, id)
	}
	if err := s.assertWritable(ctx, c.UserID, existing); err != nil {
		return nil, err
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
		done = *req.Done
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
	return todoToProto(row), nil
}

func (s *Todo) DeleteTodo(ctx context.Context, req *doxv1.DeleteTodoRequest) (*doxv1.DeleteTodoResponse, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}
	existing, err := s.q.GetTodo(ctx, id)
	if err != nil {
		return nil, translateGetTodoErr(err, id)
	}
	if err := s.assertWritable(ctx, c.UserID, existing); err != nil {
		return nil, err
	}
	if _, err := s.q.DeleteTodo(ctx, id); err != nil {
		return nil, status.Errorf(codes.Internal, "delete todo: %v", err)
	}
	return &doxv1.DeleteTodoResponse{}, nil
}

// resolveID accepts either a full ULID or a unique prefix (scoped to the
// caller's visible todos) and returns the canonical 26-char id.
func (s *Todo) resolveID(ctx context.Context, userID, raw string) (string, error) {
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
	matches, err := s.q.FindTodoIDsByPrefix(ctx, queries.FindTodoIDsByPrefixParams{
		Prefix: normalized,
		UserID: userID,
	})
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

// assertVisible returns NotFound if the caller cannot see the todo.
func (s *Todo) assertVisible(ctx context.Context, userID string, t queries.Todo) error {
	if !t.ProjectID.Valid {
		if t.CreatedBy == userID {
			return nil
		}
		return status.Errorf(codes.NotFound, "todo %q not found", t.ID)
	}
	return authz.CanReadProject(ctx, s.q, userID, t.ProjectID.String)
}

// assertWritable returns NotFound for invisible todos and PermissionDenied for
// read-only access.
func (s *Todo) assertWritable(ctx context.Context, userID string, t queries.Todo) error {
	if !t.ProjectID.Valid {
		if t.CreatedBy == userID {
			return nil
		}
		return status.Errorf(codes.NotFound, "todo %q not found", t.ID)
	}
	return authz.CanWriteProjectTodos(ctx, s.q, userID, t.ProjectID.String)
}

func translateGetTodoErr(err error, id string) error {
	if errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.NotFound, "todo %q not found", id)
	}
	return status.Errorf(codes.Internal, "get todo: %v", err)
}

func todoToProto(t queries.Todo) *doxv1.Todo {
	out := &doxv1.Todo{
		Id:        t.ID,
		Title:     t.Title,
		Done:      t.Done,
		CreatedBy: t.CreatedBy,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
	if t.ProjectID.Valid {
		v := t.ProjectID.String
		out.ProjectId = &v
	}
	return out
}

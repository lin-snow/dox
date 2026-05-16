package service

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

type TodoService struct {
	doxv1.UnimplementedTodoServiceServer
	q *queries.Queries
}

func NewTodoService(q *queries.Queries) *TodoService {
	return &TodoService{q: q}
}

func (s *TodoService) ListTodos(ctx context.Context, _ *doxv1.ListTodosRequest) (*doxv1.ListTodosResponse, error) {
	rows, err := s.q.ListTodos(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list todos: %v", err)
	}
	todos := make([]*doxv1.Todo, 0, len(rows))
	for _, r := range rows {
		todos = append(todos, &doxv1.Todo{
			Id:        r.ID,
			Title:     r.Title,
			Done:      r.Done != 0,
			CreatedAt: r.CreatedAt,
			UpdatedAt: r.UpdatedAt,
		})
	}
	return &doxv1.ListTodosResponse{Todos: todos}, nil
}

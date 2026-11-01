package handler_test

import (
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
)

func TestCreateTodo_meetingWindowRoundTrip(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	start := later(2 * 3_600_000)
	end := start + 3_600_000

	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title:    "design review",
		StartsAt: new(start),
		EndsAt:   new(end),
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	if todo.GetStartsAt() != start || todo.GetEndsAt() != end {
		t.Fatalf("window = %d..%d; want %d..%d", todo.GetStartsAt(), todo.GetEndsAt(), start, end)
	}
	// The window is independent of the deadline: a meeting with no due_at is
	// still a meeting.
	if todo.DueAt != nil {
		t.Errorf("due_at = %d; want unset", todo.GetDueAt())
	}

	list, err := s.ListTodos(ctx, &doxv1.ListTodosRequest{ProjectId: new("inbox")})
	if err != nil {
		t.Fatalf("ListTodos: %v", err)
	}
	if len(list.Todos) != 1 || list.Todos[0].GetStartsAt() != start || list.Todos[0].GetEndsAt() != end {
		t.Fatalf("list lost the window: %+v", list.Todos)
	}
}

func TestCreateTodo_meetingValidation(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	start := later(3_600_000)
	end := start + 3_600_000

	tests := []struct {
		name     string
		start    *int64
		end      *int64
		wantCode codes.Code
	}{
		{"both", new(start), new(end), codes.OK},
		{"start only", new(start), nil, codes.InvalidArgument},
		{"end only", nil, new(end), codes.InvalidArgument},
		{"end before start", new(end), new(start), codes.InvalidArgument},
		{"zero length", new(start), new(start), codes.InvalidArgument},
		{"negative", new(int64(-1)), new(end), codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
				Title:    "meet",
				StartsAt: tt.start,
				EndsAt:   tt.end,
			})
			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v (%v); want %v", got, err, tt.wantCode)
			}
		})
	}
}

// A patch may carry one side of the window: the other comes from the stored
// row, which is how "the meeting runs an hour longer" stays a one-field edit.
func TestUpdateTodo_meetingPatchResolvesAgainstStoredWindow(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	start := later(3_600_000)
	end := start + 3_600_000
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title: "sync", StartsAt: new(start), EndsAt: new(end),
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	longer := end + 3_600_000
	updated, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.GetId(), EndsAt: new(longer),
	})
	if err != nil {
		t.Fatalf("UpdateTodo: %v", err)
	}
	if updated.GetStartsAt() != start || updated.GetEndsAt() != longer {
		t.Fatalf("window = %d..%d; want %d..%d", updated.GetStartsAt(), updated.GetEndsAt(), start, longer)
	}

	// Moving the start past the stored end must fail instead of silently
	// producing a backwards window.
	_, err = s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.GetId(), StartsAt: new(longer + 1),
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("backwards window: code = %v; want InvalidArgument", status.Code(err))
	}
}

func TestUpdateTodo_meetingClear(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	start := later(3_600_000)
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title: "sync", StartsAt: new(start), EndsAt: new(start + 3_600_000),
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	// 0 on either side clears the whole window: a half window is not a fact.
	cleared, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.GetId(), EndsAt: new(int64(0)),
	})
	if err != nil {
		t.Fatalf("UpdateTodo: %v", err)
	}
	if cleared.StartsAt != nil || cleared.EndsAt != nil {
		t.Fatalf("window survived clear: %d..%d", cleared.GetStartsAt(), cleared.GetEndsAt())
	}
}

// Patching the window alone must not disturb the deadline machinery.
func TestUpdateTodo_meetingLeavesDueAlone(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	due := later(7_200_000)
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "ship", DueAt: new(due)})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	start := later(3_600_000)
	updated, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.GetId(), StartsAt: new(start), EndsAt: new(start + 1_800_000),
	})
	if err != nil {
		t.Fatalf("UpdateTodo: %v", err)
	}
	if updated.GetDueAt() != due {
		t.Errorf("due_at = %d; want %d", updated.GetDueAt(), due)
	}
}

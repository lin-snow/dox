package handler_test

import (
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
)

func later(ms int64) int64 { return time.Now().Add(time.Duration(ms) * time.Millisecond).UnixMilli() }

func TestCreateTodo_dueAndRemindRoundTrip(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	due := later(time.Hour.Milliseconds())

	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title:     "ship it",
		DueAt:     new(due),
		DueAllDay: new(true),
		DueZone:   new("Asia/Shanghai"),
		RemindAt:  new(due - 600_000),
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	if todo.GetDueAt() != due {
		t.Errorf("due_at = %d; want %d", todo.GetDueAt(), due)
	}
	if !todo.GetDueAllDay() || todo.GetDueZone() != "Asia/Shanghai" {
		t.Errorf("all_day/zone = %v/%q", todo.GetDueAllDay(), todo.GetDueZone())
	}
	if todo.GetRemindAt() != due-600_000 {
		t.Errorf("remind_at = %d", todo.GetRemindAt())
	}

	// ListTodos must carry the same due fields (the row mapping is shared).
	list, err := s.ListTodos(ctx, &doxv1.ListTodosRequest{ProjectId: new("inbox")})
	if err != nil {
		t.Fatalf("ListTodos: %v", err)
	}
	if len(list.Todos) != 1 || list.Todos[0].GetDueAt() != due || list.Todos[0].GetRemindAt() != due-600_000 {
		t.Fatalf("list lost due fields: %+v", list.Todos)
	}
}

func TestCreateTodo_dueValidation(t *testing.T) {
	tests := []struct {
		name string
		req  *doxv1.CreateTodoRequest
	}{
		{"all_day without due", &doxv1.CreateTodoRequest{Title: "x", DueAllDay: new(true)}},
		{"zone without due", &doxv1.CreateTodoRequest{Title: "x", DueZone: new("UTC")}},
		{"unknown zone", &doxv1.CreateTodoRequest{Title: "x", DueAt: new(later(0)), DueZone: new("Mars/Olympus")}},
		{"negative due", &doxv1.CreateTodoRequest{Title: "x", DueAt: new(int64(-1))}},
		{"due beyond horizon", &doxv1.CreateTodoRequest{Title: "x", DueAt: new(later(time.Hour.Milliseconds()) + 3_600_000_000_000)}},
		{"negative remind", &doxv1.CreateTodoRequest{Title: "x", RemindAt: new(int64(-5))}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _, ctx := newTodoFixture(t)
			_, err := s.CreateTodo(ctx, tt.req)
			if c := status.Code(err); c != codes.InvalidArgument {
				t.Fatalf("want InvalidArgument, got %v (%v)", c, err)
			}
		})
	}
}

func TestUpdateTodo_duePatchSemantics(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: "t"})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	due := later(time.Hour.Milliseconds())

	// A patch that touches only all_day must be rejected: there is no deadline
	// to qualify.
	if _, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, DueAllDay: new(true),
	}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("all_day without due_at: want InvalidArgument, got %v", err)
	}

	// Set deadline + all-day + zone in one patch.
	got, err := s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, DueAt: new(due), DueAllDay: new(true), DueZone: new("Europe/Berlin"),
	})
	if err != nil {
		t.Fatalf("UpdateTodo set: %v", err)
	}
	if got.GetDueAt() != due || !got.GetDueAllDay() || got.GetDueZone() != "Europe/Berlin" {
		t.Fatalf("due patch not applied: %+v", got)
	}

	// remind_at is independent of due_at and clearable on its own.
	if got, err = s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, RemindAt: new(due - 1000),
	}); err != nil || got.GetRemindAt() != due-1000 {
		t.Fatalf("set remind_at: %+v, %v", got, err)
	}
	if got, err = s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, RemindAt: new(int64(0)),
	}); err != nil || got.RemindAt != nil {
		t.Fatalf("clear remind_at: %+v, %v", got, err)
	}

	// Clearing due_at must clear the dependent fields atomically, not leave an
	// all-day flag or zone behind with no date.
	if got, err = s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, DueAt: new(int64(0)),
	}); err != nil {
		t.Fatalf("clear due: %v", err)
	}
	if got.DueAt != nil || got.DueAllDay != nil || got.DueZone != nil {
		t.Fatalf("due clear left dependent fields: due_at=%v all_day=%v zone=%v",
			got.DueAt, got.DueAllDay, got.DueZone)
	}

	// An unrelated patch must not resurrect or disturb the cleared deadline.
	if got, err = s.UpdateTodo(ctx, &doxv1.UpdateTodoRequest{
		Id: todo.Id, Title: new("renamed"),
	}); err != nil || got.DueAt != nil {
		t.Fatalf("title patch touched due: %+v, %v", got, err)
	}
}

package handler_test

import (
	"context"
	"testing"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

// createTodo is the boring constructor every ordering test needs.
func createTodo(t *testing.T, s *handler.Todo, ctx context.Context, title string) *doxv1.Todo {
	t.Helper()
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{Title: title})
	if err != nil {
		t.Fatalf("CreateTodo(%q): %v", title, err)
	}
	return todo
}

func inboxTitles(t *testing.T, s *handler.Todo, ctx context.Context) []string {
	t.Helper()
	list, err := s.ListTodos(ctx, &doxv1.ListTodosRequest{ProjectId: new("inbox")})
	if err != nil {
		t.Fatalf("ListTodos: %v", err)
	}
	titles := make([]string, 0, len(list.Todos))
	for _, todo := range list.Todos {
		titles = append(titles, todo.GetTitle())
	}
	return titles
}

func wantOrder(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("order = %v; want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order = %v; want %v", got, want)
		}
	}
}

// A fresh inbox is newest-first, exactly as it was before positions existed:
// every row keeps the default 0 and the tie breaks on created_at.
func TestListTodos_newestFirst(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")
	createTodo(t, s, ctx, "c")

	wantOrder(t, inboxTitles(t, s, ctx), []string{"c", "b", "a"})
}

func TestMoveTodo_afterAnchor(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	b := createTodo(t, s, ctx, "b")
	c := createTodo(t, s, ctx, "c")

	moved, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: a.GetId(), AfterId: &c.Id})
	if err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	wantOrder(t, inboxTitles(t, s, ctx), []string{"c", "a", "b"})
	// Dense renumber, highest first: c=2, a=1, b=0.
	if moved.GetPosition() != 1 {
		t.Errorf("moved position = %d; want 1", moved.GetPosition())
	}
	if moved.GetTitle() != "a" {
		t.Errorf("MoveTodo returned %q; want the moved todo", moved.GetTitle())
	}

	// The neighbours did not become "edited": only the moved row's updated_at
	// advances, which is what keeps a drag from looking like a list rewrite.
	after, err := s.GetTodo(ctx, &doxv1.GetTodoRequest{Id: b.GetId()})
	if err != nil {
		t.Fatalf("GetTodo: %v", err)
	}
	if after.GetUpdatedAt() != b.GetUpdatedAt() {
		t.Errorf("neighbour updated_at = %d; want %d", after.GetUpdatedAt(), b.GetUpdatedAt())
	}
}

func TestMoveTodo_toFront(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")
	createTodo(t, s, ctx, "c")

	if _, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: a.GetId()}); err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	wantOrder(t, inboxTitles(t, s, ctx), []string{"a", "c", "b"})
}

func TestMoveTodo_firstAfterLast(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")
	c := createTodo(t, s, ctx, "c")

	// c starts on top and ends at the bottom: the anchor is the last row.
	if _, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: c.GetId(), AfterId: &a.Id}); err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	wantOrder(t, inboxTitles(t, s, ctx), []string{"b", "a", "c"})
}

func TestMoveTodo_ontoItselfIsNoop(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")

	if _, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: a.GetId(), AfterId: &a.Id}); err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	wantOrder(t, inboxTitles(t, s, ctx), []string{"b", "a"})
}

// A new todo still lands on top after the list has been dragged into a manual
// order -- that is what NextTodoPosition buys.
func TestCreateTodo_afterReorderLandsOnTop(t *testing.T) {
	s, _, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")

	if _, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: a.GetId()}); err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	createTodo(t, s, ctx, "fresh")
	wantOrder(t, inboxTitles(t, s, ctx), []string{"fresh", "a", "b"})
}

// Reordering is not an activity verb: the feed must stay at "two todos
// created" even though the list was moved.
func TestMoveTodo_publishesNoEvent(t *testing.T) {
	s, q, ctx := newTodoFixture(t)
	a := createTodo(t, s, ctx, "a")
	createTodo(t, s, ctx, "b")

	if _, err := s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: a.GetId()}); err != nil {
		t.Fatalf("MoveTodo: %v", err)
	}
	events, err := handler.NewEvent(q, handler.NewChanges()).ListEvents(ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events.Events) != 2 {
		t.Fatalf("events = %d; want 2 (the two creates)", len(events.Events))
	}
}

func TestMoveTodo_anchorMustShareTheScope(t *testing.T) {
	s, q, ctx := newTodoFixture(t)
	owner := caller.MustFrom(ctx)

	proj, err := q.CreateProject(context.Background(), queries.CreateProjectParams{
		ID: ulid.Make().String(), OwnerID: owner.UserID, Name: "shared", CreatedAt: 1, UpdatedAt: 1,
	})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	inProject, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title: "project todo", ProjectId: &proj.ID,
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	inbox := createTodo(t, s, ctx, "inbox todo")

	_, err = s.MoveTodo(ctx, &doxv1.MoveTodoRequest{Id: inbox.GetId(), AfterId: &inProject.Id})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("cross-scope anchor: code = %v; want InvalidArgument", status.Code(err))
	}
}

func TestMoveTodo_requiresWriteAccess(t *testing.T) {
	s, q, ctx := newTodoFixture(t)
	owner := caller.MustFrom(ctx)

	proj, err := q.CreateProject(context.Background(), queries.CreateProjectParams{
		ID: ulid.Make().String(), OwnerID: owner.UserID, Name: "shared", CreatedAt: 1, UpdatedAt: 1,
	})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	viewer := seedUser(t, q, "bob", caller.RoleMember)
	if err := q.AddProjectMember(context.Background(), queries.AddProjectMemberParams{
		ProjectID: proj.ID, UserID: viewer.ID, Role: authz.RoleViewer, AddedAt: 1,
	}); err != nil {
		t.Fatalf("AddProjectMember: %v", err)
	}
	todo, err := s.CreateTodo(ctx, &doxv1.CreateTodoRequest{
		Title: "project todo", ProjectId: &proj.ID,
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	viewerCtx := caller.With(context.Background(), caller.Caller{
		UserID: viewer.ID, UserName: viewer.Name, Role: viewer.Role,
	})
	_, err = s.MoveTodo(viewerCtx, &doxv1.MoveTodoRequest{Id: todo.GetId()})
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("viewer move: code = %v; want PermissionDenied", status.Code(err))
	}
}

func TestMoveTodo_invisibleTodoIsNotFound(t *testing.T) {
	s, q, ctx := newTodoFixture(t)
	stranger := seedUser(t, q, "bob", caller.RoleMember)
	todo := createTodo(t, s, ctx, "private")

	strangerCtx := caller.With(context.Background(), caller.Caller{
		UserID: stranger.ID, UserName: stranger.Name, Role: stranger.Role,
	})
	_, err := s.MoveTodo(strangerCtx, &doxv1.MoveTodoRequest{Id: todo.GetId()})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("stranger move: code = %v; want NotFound", status.Code(err))
	}
}

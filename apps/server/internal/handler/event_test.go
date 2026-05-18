package handler_test

import (
	"context"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

// eventFixture wires up the full handler set against a shared sqlite so the
// event tests can drive real mutations (todos, invites) and assert against the
// rows ListEvents fans back out.
type eventFixture struct {
	todo  *handler.Todo
	inv   *handler.Invite
	ev    *handler.Event
	proj  *handler.Project
	q     *queries.Queries
	owner queries.User
	ctx   context.Context
}

func newEventFixture(t *testing.T) *eventFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "events.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	owner := seedUser(t, q, "alice", caller.RoleOwner)
	ctx := caller.With(context.Background(), caller.Caller{
		UserID: owner.ID, UserName: owner.Name, Role: owner.Role,
	})
	b := testBus()
	return &eventFixture{
		todo:  handler.NewTodo(conn, q, b),
		inv:   handler.NewInvite(conn, q, b),
		ev:    handler.NewEvent(q),
		proj:  handler.NewProject(q),
		q:     q,
		owner: owner,
		ctx:   ctx,
	}
}

func (f *eventFixture) withUser(t *testing.T, u queries.User) context.Context {
	t.Helper()
	return caller.With(context.Background(), caller.Caller{
		UserID: u.ID, UserName: u.Name, Role: u.Role,
	})
}

func (f *eventFixture) createProject(t *testing.T, ownerCtx context.Context, name string) *doxv1.Project {
	t.Helper()
	p, err := f.proj.CreateProject(ownerCtx, &doxv1.CreateProjectRequest{Name: name})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return p
}

func TestListEvents_filtersByVisibility(t *testing.T) {
	f := newEventFixture(t)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	// Alice creates a project + a todo inside it. Bob is not a member.
	proj := f.createProject(t, f.ctx, "secret")
	if _, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{
		Title:     "private work",
		ProjectId: &proj.Id,
	}); err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	// Alice sees the event with project metadata populated.
	aliceList, err := f.ev.ListEvents(f.ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents(alice): %v", err)
	}
	if len(aliceList.Events) != 1 || aliceList.Events[0].Verb != "todo_created" {
		t.Fatalf("alice want 1 todo_created event, got %+v", aliceList.Events)
	}
	if aliceList.Events[0].ActorName != "alice" || aliceList.Events[0].ProjectName != "secret" {
		t.Errorf("joined fields wrong: %+v", aliceList.Events[0])
	}

	// Bob sees nothing — project visibility excludes him AND Alice's event
	// isn't personal-scope, so he can't see it through the actor predicate
	// either.
	bobCtx := f.withUser(t, bob)
	bobList, err := f.ev.ListEvents(bobCtx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents(bob): %v", err)
	}
	if len(bobList.Events) != 0 {
		t.Errorf("bob should see 0 events, got %d", len(bobList.Events))
	}
}

func TestListEvents_privateActivityVisibleOnlyToActor(t *testing.T) {
	f := newEventFixture(t)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	// Alice creates a private (Inbox) todo + completes it. Both events should
	// be personal-scope (project_id NULL) and visible only to Alice.
	created, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{Title: "buy milk"})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	done := true
	if _, err := f.todo.UpdateTodo(f.ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Done: &done}); err != nil {
		t.Fatalf("UpdateTodo: %v", err)
	}

	aliceList, err := f.ev.ListEvents(f.ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents(alice): %v", err)
	}
	if len(aliceList.Events) != 2 {
		t.Fatalf("alice want 2 personal events, got %d: %+v", len(aliceList.Events), aliceList.Events)
	}
	for _, e := range aliceList.Events {
		if e.ProjectId != "" || e.ProjectName != "" || e.ProjectColor != "" {
			t.Errorf("personal event leaked project metadata: %+v", e)
		}
		if e.ActorName != "alice" {
			t.Errorf("actor_name = %q, want alice", e.ActorName)
		}
	}
	// Newest first: completion sits above creation.
	if aliceList.Events[0].Verb != "todo_completed" || aliceList.Events[1].Verb != "todo_created" {
		t.Errorf("verbs = [%s %s], want [todo_completed todo_created]",
			aliceList.Events[0].Verb, aliceList.Events[1].Verb)
	}

	// Bob can't see Alice's personal events.
	bobCtx := f.withUser(t, bob)
	bobList, err := f.ev.ListEvents(bobCtx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents(bob): %v", err)
	}
	if len(bobList.Events) != 0 {
		t.Errorf("bob should see 0 events, got %d", len(bobList.Events))
	}
}

func TestListEvents_mergesPersonalAndProjectScopes(t *testing.T) {
	f := newEventFixture(t)

	// Alice creates a project + a project todo, then a private todo. Both
	// should appear in her feed, ordered by created_at desc.
	proj := f.createProject(t, f.ctx, "work")
	if _, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{
		Title:     "ship feature",
		ProjectId: &proj.Id,
	}); err != nil {
		t.Fatalf("CreateTodo(project): %v", err)
	}
	if _, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{Title: "buy milk"}); err != nil {
		t.Fatalf("CreateTodo(private): %v", err)
	}

	list, err := f.ev.ListEvents(f.ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(list.Events) != 2 {
		t.Fatalf("want 2 events, got %d", len(list.Events))
	}
	// Both project and personal scopes share one chronological stream. The
	// private todo created second should sort first; only it lacks project
	// metadata.
	if list.Events[0].TargetLabel != "buy milk" {
		t.Errorf("first event target = %q, want %q", list.Events[0].TargetLabel, "buy milk")
	}
	if list.Events[0].ProjectId != "" {
		t.Errorf("personal event project_id = %q, want empty", list.Events[0].ProjectId)
	}
	if list.Events[1].ProjectName != "work" {
		t.Errorf("project event project_name = %q, want work", list.Events[1].ProjectName)
	}
}

func TestListEvents_completionEmitsTransitionOnly(t *testing.T) {
	f := newEventFixture(t)
	proj := f.createProject(t, f.ctx, "work")
	created, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{
		Title:     "ship it",
		ProjectId: &proj.Id,
	})
	if err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}

	// Flip done false→true: should emit todo_completed.
	done := true
	if _, err := f.todo.UpdateTodo(f.ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Done: &done}); err != nil {
		t.Fatalf("UpdateTodo done=true: %v", err)
	}

	// Idempotent re-mark: already done, should NOT emit another event.
	if _, err := f.todo.UpdateTodo(f.ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Done: &done}); err != nil {
		t.Fatalf("UpdateTodo done=true again: %v", err)
	}

	// Flip back to open: also should NOT emit (we only care about false→true).
	notDone := false
	if _, err := f.todo.UpdateTodo(f.ctx, &doxv1.UpdateTodoRequest{Id: created.Id, Done: &notDone}); err != nil {
		t.Fatalf("UpdateTodo done=false: %v", err)
	}

	list, err := f.ev.ListEvents(f.ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	// Expect exactly 2 events: todo_created + one todo_completed transition.
	if len(list.Events) != 2 {
		t.Fatalf("want 2 events, got %d: %+v", len(list.Events), list.Events)
	}
	verbs := []string{list.Events[0].Verb, list.Events[1].Verb}
	// Newest first.
	if verbs[0] != "todo_completed" || verbs[1] != "todo_created" {
		t.Errorf("verbs = %v, want [todo_completed todo_created]", verbs)
	}
}

func TestListEvents_acceptInviteEmitsMemberJoined(t *testing.T) {
	f := newEventFixture(t)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	// Alice creates a project and issues an editor invite Bob can accept.
	proj := f.createProject(t, f.ctx, "shared")
	role := authz.RoleEditor
	invite, err := f.inv.CreateInvite(f.ctx, &doxv1.CreateInviteRequest{
		ProjectId: &proj.Id,
		Role:      &role,
	})
	if err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}

	// Bob accepts.
	bobCtx := f.withUser(t, bob)
	if _, err := f.inv.AcceptInvite(bobCtx, &doxv1.AcceptInviteRequest{Code: invite.Code}); err != nil {
		t.Fatalf("AcceptInvite: %v", err)
	}

	// Alice (project owner) should now see a member_joined event with Bob as
	// the actor and the project's name snapshotted in target_label.
	list, err := f.ev.ListEvents(f.ctx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(list.Events) != 1 {
		t.Fatalf("want 1 event, got %d: %+v", len(list.Events), list.Events)
	}
	e := list.Events[0]
	if e.Verb != "member_joined" {
		t.Errorf("verb = %q, want member_joined", e.Verb)
	}
	if e.ActorName != "bob" {
		t.Errorf("actor_name = %q, want bob", e.ActorName)
	}
	if e.TargetLabel != "shared" {
		t.Errorf("target_label = %q, want shared", e.TargetLabel)
	}
	if e.ProjectId != proj.Id {
		t.Errorf("project_id = %q, want %q", e.ProjectId, proj.Id)
	}

	// Bob now a member, should also see the same event from his side.
	bobList, err := f.ev.ListEvents(bobCtx, &doxv1.ListEventsRequest{})
	if err != nil {
		t.Fatalf("ListEvents(bob): %v", err)
	}
	if len(bobList.Events) != 1 {
		t.Errorf("bob want 1 event, got %d", len(bobList.Events))
	}

	// Sanity: project_members row was actually written by AcceptInvite.
	if _, err := f.q.GetProjectMembership(context.Background(), queries.GetProjectMembershipParams{
		ProjectID: proj.Id,
		UserID:    bob.ID,
	}); err != nil {
		t.Errorf("GetProjectMembership: %v", err)
	}
}

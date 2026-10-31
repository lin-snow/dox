package handler_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

type authFixture struct {
	conn  *sql.DB
	q     *queries.Queries
	users *handler.User
	inv   *handler.Invite
	proj  *handler.Project
	ev    *handler.Event
}

func newAuthFixture(t *testing.T) *authFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	b := testBus()
	return &authFixture{
		conn:  conn,
		q:     q,
		users: handler.NewUser(conn, q, b, testSecret),
		inv:   handler.NewInvite(conn, q, b, testSecret),
		proj:  handler.NewProject(q),
		ev:    handler.NewEvent(q),
	}
}

func (f *authFixture) openRegistration(t *testing.T) {
	t.Helper()
	if err := f.q.UpsertSetting(context.Background(), queries.UpsertSettingParams{
		Key: "registration_open", Value: "true",
	}); err != nil {
		t.Fatalf("open registration: %v", err)
	}
}

// TestRegister_FailedUsernameDoesNotBurnInvite is the regression test for the
// old non-transactional flow: ConsumeInvite ran before CreateUser, so a taken
// username consumed the code and left the invitee with neither account nor
// redeemable invite.
func TestRegister_FailedUsernameDoesNotBurnInvite(t *testing.T) {
	f := newAuthFixture(t)
	owner, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatalf("register owner: %v", err)
	}
	ownerCtx := callerCtxFor(t, owner.Token)

	inv, err := f.inv.CreateInvite(ownerCtx, &doxv1.CreateInviteRequest{})
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}

	_, err = f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword, InviteCode: &inv.Code,
	})
	if status.Code(err) != codes.AlreadyExists {
		t.Fatalf("want AlreadyExists for duplicate name, got %v", err)
	}

	// The failed attempt must not have consumed the code.
	bob, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword, InviteCode: &inv.Code,
	})
	if err != nil {
		t.Fatalf("invite should still be redeemable: %v", err)
	}
	if bob.Role != caller.RoleMember {
		t.Errorf("want member role, got %q", bob.Role)
	}

	list, err := f.inv.ListOutgoingInvites(ownerCtx, &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("list invites: %v", err)
	}
	if got := len(list.GetInvites()); got != 0 {
		t.Errorf("invite should be consumed after successful register, got %d outstanding", got)
	}
}

// TestAcceptInvite_ServerInviteNotConsumedOnRejection covers the sibling bug:
// AcceptInvite consumed the code before checking whether it was a server
// invite, so `dox accept <server-code>` burned the owner's code while failing.
func TestAcceptInvite_ServerInviteNotConsumedOnRejection(t *testing.T) {
	f := newAuthFixture(t)
	owner, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatalf("register owner: %v", err)
	}
	ownerCtx := callerCtxFor(t, owner.Token)
	f.openRegistration(t)

	bob, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword,
	})
	if err != nil {
		t.Fatalf("register bob: %v", err)
	}
	bobCtx := callerCtxFor(t, bob.Token)

	inv, err := f.inv.CreateInvite(ownerCtx, &doxv1.CreateInviteRequest{})
	if err != nil {
		t.Fatalf("create server invite: %v", err)
	}
	if _, err := f.inv.AcceptInvite(bobCtx, &doxv1.AcceptInviteRequest{Code: inv.Code}); status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("want FailedPrecondition, got %v", err)
	}

	list, err := f.inv.ListOutgoingInvites(ownerCtx, &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("list invites: %v", err)
	}
	if got := len(list.GetInvites()); got != 1 {
		t.Fatalf("rejected accept must not consume the code, got %d outstanding", got)
	}

	if _, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "carol", Password: goodPassword, InviteCode: &inv.Code,
	}); err != nil {
		t.Fatalf("server invite should still onboard a new user: %v", err)
	}
}

// TestRegister_ProjectInviteEmitsMemberJoined keeps registered and
// accept-invite join paths consistent in the activity feed.
func TestRegister_ProjectInviteEmitsMemberJoined(t *testing.T) {
	f := newAuthFixture(t)
	owner, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatalf("register owner: %v", err)
	}
	ownerCtx := callerCtxFor(t, owner.Token)

	proj, err := f.proj.CreateProject(ownerCtx, &doxv1.CreateProjectRequest{Name: "shared"})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	role := "editor"
	inv, err := f.inv.CreateInvite(ownerCtx, &doxv1.CreateInviteRequest{
		ProjectId: &proj.Id, Role: &role,
	})
	if err != nil {
		t.Fatalf("create project invite: %v", err)
	}

	bob, err := f.users.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword, InviteCode: &inv.Code,
	})
	if err != nil {
		t.Fatalf("register with project invite: %v", err)
	}
	bobCtx := callerCtxFor(t, bob.Token)

	resp, err := f.ev.ListEvents(bobCtx, &doxv1.ListEventsRequest{Limit: 50})
	if err != nil {
		t.Fatalf("list events: %v", err)
	}
	for _, e := range resp.GetEvents() {
		if e.GetVerb() == "member_joined" && e.GetProjectId() == proj.Id && e.GetActorId() == bob.UserId {
			return
		}
	}
	t.Fatalf("register-with-project-invite did not emit member_joined: %+v", resp.GetEvents())
}

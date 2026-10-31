package handler_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

type inviteFixture struct {
	inv  *handler.Invite
	proj *handler.Project
	q    *queries.Queries
}

func newInviteFixture(t *testing.T) *inviteFixture {
	t.Helper()
	path := filepath.Join(t.TempDir(), "invite.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	return &inviteFixture{
		inv:  handler.NewInvite(conn, q, testBus(), testSecret),
		proj: handler.NewProject(q),
		q:    q,
	}
}

func ctxFor(u queries.User) context.Context {
	return caller.With(context.Background(), caller.Caller{
		UserID: u.ID, UserName: u.Name, Role: u.Role,
	})
}

func TestListOutgoingInvites_filtersToCaller(t *testing.T) {
	f := newInviteFixture(t)
	alice := seedUser(t, f.q, "alice", caller.RoleOwner)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	if _, err := f.inv.CreateInvite(ctxFor(alice), &doxv1.CreateInviteRequest{}); err != nil {
		t.Fatalf("alice CreateInvite: %v", err)
	}

	aliceList, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("alice ListOutgoingInvites: %v", err)
	}
	if got := len(aliceList.GetInvites()); got != 1 {
		t.Fatalf("alice should see 1 invite, got %d", got)
	}

	bobList, err := f.inv.ListOutgoingInvites(ctxFor(bob), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("bob ListOutgoingInvites: %v", err)
	}
	if got := len(bobList.GetInvites()); got != 0 {
		t.Fatalf("bob should see 0 invites, got %d", got)
	}
}

func TestRevokeInvite_scopedToIssuer(t *testing.T) {
	f := newInviteFixture(t)
	alice := seedUser(t, f.q, "alice", caller.RoleOwner)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	created, err := f.inv.CreateInvite(ctxFor(alice), &doxv1.CreateInviteRequest{})
	if err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}

	got, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("ListOutgoingInvites: %v", err)
	}
	if len(got.GetInvites()) != 1 {
		t.Fatalf("expected 1 invite, got %d", len(got.GetInvites()))
	}
	codeHash := got.GetInvites()[0].GetCodeHash()

	_, err = f.inv.RevokeInvite(ctxFor(bob), &doxv1.RevokeInviteRequest{CodeHash: codeHash})
	if err == nil {
		t.Fatal("expected error when bob revokes alice's invite, got nil")
	}
	if st, _ := status.FromError(err); st.Code() != codes.NotFound {
		t.Fatalf("expected NotFound, got %v", st.Code())
	}

	stillThere, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("re-list: %v", err)
	}
	if len(stillThere.GetInvites()) != 1 {
		t.Fatalf("invite should survive bob's failed revoke, got %d rows", len(stillThere.GetInvites()))
	}

	if _, err := f.inv.RevokeInvite(ctxFor(alice), &doxv1.RevokeInviteRequest{CodeHash: codeHash}); err != nil {
		t.Fatalf("alice RevokeInvite: %v", err)
	}
	after, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("post-revoke list: %v", err)
	}
	if len(after.GetInvites()) != 0 {
		t.Fatalf("expected 0 invites after revoke, got %d", len(after.GetInvites()))
	}

	if _, err := f.inv.AcceptInvite(ctxFor(bob), &doxv1.AcceptInviteRequest{Code: created.GetCode()}); err == nil {
		t.Fatal("expected AcceptInvite to fail after revoke")
	}
}

func TestCreateInvite_StoresKeyedHash(t *testing.T) {
	f := newInviteFixture(t)
	alice := seedUser(t, f.q, "alice", caller.RoleOwner)

	created, err := f.inv.CreateInvite(ctxFor(alice), &doxv1.CreateInviteRequest{})
	if err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}
	list, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("ListOutgoingInvites: %v", err)
	}
	if len(list.GetInvites()) != 1 {
		t.Fatalf("want 1 invite, got %d", len(list.GetInvites()))
	}
	got := list.GetInvites()[0].GetCodeHash()
	want := authn.KeyedHashInviteCode(testSecret, created.GetCode())
	if got != want {
		t.Errorf("stored hash is not keyed: got %q want %q", got, want)
	}
	if got == authn.LegacyHashInviteCode(created.GetCode()) {
		t.Error("new invites must not use the legacy unkeyed digest")
	}
}

func TestAcceptInvite_LegacyHashStillRedeemable(t *testing.T) {
	f := newInviteFixture(t)
	alice := seedUser(t, f.q, "alice", caller.RoleOwner)
	bob := seedUser(t, f.q, "bob", caller.RoleMember)

	proj, err := f.proj.CreateProject(ctxFor(alice), &doxv1.CreateProjectRequest{Name: "legacy"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	code, err := authn.GenerateCode()
	if err != nil {
		t.Fatalf("GenerateCode: %v", err)
	}
	now := time.Now().UTC().UnixMilli()
	if err := f.q.CreateInvite(context.Background(), queries.CreateInviteParams{
		CodeHash:  authn.LegacyHashInviteCode(code),
		IssuedBy:  alice.ID,
		ProjectID: sql.NullString{String: proj.Id, Valid: true},
		Role:      sql.NullString{String: authz.RoleEditor, Valid: true},
		CreatedAt: now,
		ExpiresAt: now + int64(time.Hour/time.Millisecond),
	}); err != nil {
		t.Fatalf("insert legacy invite: %v", err)
	}

	resp, err := f.inv.AcceptInvite(ctxFor(bob), &doxv1.AcceptInviteRequest{Code: code})
	if err != nil {
		t.Fatalf("legacy invite should still redeem: %v", err)
	}
	if resp.GetProjectId() != proj.Id || resp.GetRole() != authz.RoleEditor {
		t.Errorf("AcceptInvite = %+v, want project %q role editor", resp, proj.Id)
	}
	if _, err := f.q.GetProjectMembership(context.Background(), queries.GetProjectMembershipParams{
		ProjectID: proj.Id, UserID: bob.ID,
	}); err != nil {
		t.Errorf("bob should be a project member: %v", err)
	}
}

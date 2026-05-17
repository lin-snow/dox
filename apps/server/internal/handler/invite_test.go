package handler_test

import (
	"context"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
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
		inv:  handler.NewInvite(conn, q, testBus()),
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

	// Alice issues a server invite. Bob shouldn't see it.
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

	// Alice issues a server invite.
	created, err := f.inv.CreateInvite(ctxFor(alice), &doxv1.CreateInviteRequest{})
	if err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}

	// Look up the row so the test can supply the code_hash.
	got, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("ListOutgoingInvites: %v", err)
	}
	if len(got.GetInvites()) != 1 {
		t.Fatalf("expected 1 invite, got %d", len(got.GetInvites()))
	}
	codeHash := got.GetInvites()[0].GetCodeHash()

	// Bob tries to revoke Alice's invite → NotFound (we deliberately don't
	// leak the difference between "not yours" and "doesn't exist").
	_, err = f.inv.RevokeInvite(ctxFor(bob), &doxv1.RevokeInviteRequest{CodeHash: codeHash})
	if err == nil {
		t.Fatal("expected error when bob revokes alice's invite, got nil")
	}
	if st, _ := status.FromError(err); st.Code() != codes.NotFound {
		t.Fatalf("expected NotFound, got %v", st.Code())
	}

	// Code is still alive — accepting it via Register-style flow would still
	// work (we don't fully exercise that here; just verify the row exists).
	stillThere, err := f.inv.ListOutgoingInvites(ctxFor(alice), &doxv1.ListOutgoingInvitesRequest{})
	if err != nil {
		t.Fatalf("re-list: %v", err)
	}
	if len(stillThere.GetInvites()) != 1 {
		t.Fatalf("invite should survive bob's failed revoke, got %d rows", len(stillThere.GetInvites()))
	}

	// Alice revokes her own — succeeds, row disappears.
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

	// Accept now fails (sanity: code really is dead).
	if _, err := f.inv.AcceptInvite(ctxFor(bob), &doxv1.AcceptInviteRequest{Code: created.GetCode()}); err == nil {
		t.Fatal("expected AcceptInvite to fail after revoke")
	}
}

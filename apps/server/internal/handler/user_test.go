package handler_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

// testSecret keeps each fixture deterministic. Real deployments load this
// from authn.LoadOrCreateJWTSecret.
var testSecret = []byte("test-jwt-secret-at-least-16-bytes!!")

const goodPassword = "hunter22-strong"

func newUserFixture(t *testing.T) (*handler.User, *queries.Queries) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	return handler.NewUser(q, testSecret), q
}

// callerCtxFor returns a context with the caller derived from a JWT issued
// for the given user — same path the middleware exercises in production.
func callerCtxFor(t *testing.T, token string) context.Context {
	t.Helper()
	v := authn.NewJWTVerifier(testSecret)
	c, ok := v.Verify(token)
	if !ok {
		t.Fatalf("test token failed to verify")
	}
	return caller.With(context.Background(), c)
}

func TestRegister_FirstUserBecomesOwner(t *testing.T) {
	s, q := newUserFixture(t)
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Role != caller.RoleOwner {
		t.Errorf("want role=owner, got %q", resp.Role)
	}
	if resp.Token == "" || resp.UserId == "" {
		t.Errorf("incomplete response: %+v", resp)
	}
	// Issued token must verify under the same secret.
	v := authn.NewJWTVerifier(testSecret)
	c, ok := v.Verify(resp.Token)
	if !ok {
		t.Fatalf("returned token did not verify")
	}
	if c.UserID != resp.UserId || c.UserName != "alice" || c.Role != caller.RoleOwner {
		t.Errorf("claims mismatch: %+v", c)
	}
	// Owner anchor written to settings.
	got, _ := q.GetSetting(context.Background(), "server_owner_id")
	if got != resp.UserId {
		t.Errorf("server_owner_id not set: got %q want %q", got, resp.UserId)
	}
}

func TestRegister_FirstUserSetsServerIdentity(t *testing.T) {
	s, q := newUserFixture(t)
	name, desc := "Alice's Dox", "family todos"
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName:          "alice",
		Password:          goodPassword,
		ServerName:        &name,
		ServerDescription: &desc,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := q.GetSetting(context.Background(), "server_name"); got != name {
		t.Errorf("server_name = %q, want %q", got, name)
	}
	if got, _ := q.GetSetting(context.Background(), "server_description"); got != desc {
		t.Errorf("server_description = %q, want %q", got, desc)
	}
}

func TestRegister_ClosedRegistrationRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword,
	})
	if status.Code(err) != codes.PermissionDenied {
		t.Errorf("want PermissionDenied, got %v", err)
	}
}

func TestRegister_EmptyNameRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "", Password: goodPassword,
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("want InvalidArgument for empty user_name, got %v", err)
	}
}

func TestRegister_ShortPasswordRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: "short",
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("want InvalidArgument for short password, got %v", err)
	}
}

func TestLogin_HappyPath(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	resp, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if resp.Token == "" || resp.Role != caller.RoleOwner {
		t.Errorf("Login: %+v", resp)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "alice", Password: "wrong-password",
	})
	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("want Unauthenticated, got %v", err)
	}
}

func TestLogin_UnknownUserUniformMessage(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "no-such-user", Password: goodPassword,
	})
	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("want Unauthenticated, got %v", err)
	}
	if !strings.Contains(err.Error(), "invalid username or password") {
		t.Errorf("want uniform error message, got %q", err.Error())
	}
}

func TestChangePassword_HappyPath(t *testing.T) {
	s, _ := newUserFixture(t)
	reg, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx := callerCtxFor(t, reg.Token)
	if _, err := s.ChangePassword(ctx, &doxv1.ChangePasswordRequest{
		OldPassword: goodPassword,
		NewPassword: "new-strong-pw",
	}); err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	// Old password no longer works.
	if _, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "alice", Password: goodPassword,
	}); status.Code(err) != codes.Unauthenticated {
		t.Errorf("old password should be rejected, got %v", err)
	}
	// New password works.
	if _, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "alice", Password: "new-strong-pw",
	}); err != nil {
		t.Errorf("new password should work: %v", err)
	}
}

func TestChangePassword_WrongOldRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	reg, _ := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	ctx := callerCtxFor(t, reg.Token)
	_, err := s.ChangePassword(ctx, &doxv1.ChangePasswordRequest{
		OldPassword: "wrong",
		NewPassword: "new-strong-pw",
	})
	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("want Unauthenticated, got %v", err)
	}
}

func TestResetUserPassword_OwnerOnly(t *testing.T) {
	s, q := newUserFixture(t)
	owner, _ := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	// Open registration so bob can sign up without an invite.
	if err := q.UpsertSetting(context.Background(), queries.UpsertSettingParams{
		Key: "registration_open", Value: "true",
	}); err != nil {
		t.Fatal(err)
	}
	bob, _ := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword,
	})

	// Non-owner cannot reset.
	bobCtx := callerCtxFor(t, bob.Token)
	if _, err := s.ResetUserPassword(bobCtx, &doxv1.ResetUserPasswordRequest{UserId: owner.UserId}); status.Code(err) != codes.PermissionDenied {
		t.Errorf("want PermissionDenied for non-owner reset, got %v", err)
	}

	// Owner can reset; returned temp password works for Login.
	ownerCtx := callerCtxFor(t, owner.Token)
	resp, err := s.ResetUserPassword(ownerCtx, &doxv1.ResetUserPasswordRequest{UserId: bob.UserId})
	if err != nil {
		t.Fatalf("owner reset: %v", err)
	}
	if resp.TempPassword == "" {
		t.Fatal("temp_password empty")
	}
	if _, err := s.Login(context.Background(), &doxv1.LoginRequest{
		UserName: "bob", Password: resp.TempPassword,
	}); err != nil {
		t.Errorf("temp password should log bob in: %v", err)
	}
}

func TestServerInfo_SurfacesIdentity(t *testing.T) {
	s, _ := newUserFixture(t)
	name, desc := "Alice's Dox", "family todos"
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName:          "alice",
		Password:          goodPassword,
		ServerName:        &name,
		ServerDescription: &desc,
	})
	if err != nil {
		t.Fatal(err)
	}
	info, err := s.ServerInfo(context.Background(), &doxv1.ServerInfoRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if !info.HasUsers || info.ServerName != name || info.ServerDescription != desc || info.OwnerName != "alice" {
		t.Errorf("ServerInfo missing identity: %+v", info)
	}
}

func TestRegister_FirstUserGetsSeedTodos(t *testing.T) {
	s, q := newUserFixture(t)
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	todos, err := q.ListInboxTodos(context.Background(), resp.UserId)
	if err != nil {
		t.Fatalf("list inbox: %v", err)
	}
	if len(todos) != 3 {
		t.Fatalf("want 3 seed todos in inbox, got %d", len(todos))
	}
	if !strings.HasPrefix(todos[0].Title, "Welcome to dox") {
		t.Errorf("want Welcome todo first, got %q", todos[0].Title)
	}
	for _, td := range todos {
		if !td.Description.Valid || td.Description.String == "" {
			t.Errorf("seed todo %q has empty description", td.Title)
		}
		if td.Done {
			t.Errorf("seed todo %q should start as open, not done", td.Title)
		}
	}
}

func TestRegister_SecondUserGetsNoSeed(t *testing.T) {
	s, q := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", Password: goodPassword,
	}); err != nil {
		t.Fatal(err)
	}
	if err := q.UpsertSetting(context.Background(), queries.UpsertSettingParams{
		Key: "registration_open", Value: "true",
	}); err != nil {
		t.Fatalf("open registration: %v", err)
	}
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", Password: goodPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	todos, err := q.ListInboxTodos(context.Background(), resp.UserId)
	if err != nil {
		t.Fatalf("list inbox: %v", err)
	}
	if len(todos) != 0 {
		t.Errorf("non-first user should not be seeded, got %d todos", len(todos))
	}
}

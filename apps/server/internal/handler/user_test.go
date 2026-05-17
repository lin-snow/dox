package handler_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

const defaultTestTTL = 60 * time.Second

func newUserFixture(t *testing.T) (*handler.User, *queries.Queries) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	return handler.NewUser(q), q
}

func TestRegister_FirstUserBecomesOwner(t *testing.T) {
	s, q := newUserFixture(t)
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName:   "alice",
		DeviceName: "laptop",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Role != caller.RoleOwner {
		t.Errorf("want role=owner, got %q", resp.Role)
	}
	if resp.Token == "" || resp.UserId == "" || resp.DeviceId == "" {
		t.Errorf("incomplete response: %+v", resp)
	}
	dev, err := q.FindDeviceByTokenHash(context.Background(), authn.HashToken(resp.Token))
	if err != nil {
		t.Fatalf("device not stored: %v", err)
	}
	if dev.UserID != resp.UserId {
		t.Errorf("device.user_id %q != response user_id %q", dev.UserID, resp.UserId)
	}
}

func TestRegister_ClosedRegistrationRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "alice", DeviceName: "laptop"}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "bob", DeviceName: "phone"})
	if status.Code(err) != codes.PermissionDenied {
		t.Errorf("want PermissionDenied, got %v", err)
	}
}

func TestRegister_EmptyNameRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "alice", DeviceName: "laptop"}); err != nil {
		t.Fatal(err)
	}
	_, err := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "", DeviceName: "laptop"})
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("want InvalidArgument for empty user_name, got %v", err)
	}
}

func TestRedeemPairingCode_BindsDeviceToExistingUser(t *testing.T) {
	s, q := newUserFixture(t)
	owner, err := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "alice", DeviceName: "laptop"})
	if err != nil {
		t.Fatal(err)
	}
	code, err := authn.CreatePairingCode(context.Background(), q, owner.UserId, "phone", defaultTestTTL)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: code})
	if err != nil {
		t.Fatal(err)
	}
	if resp.UserId != owner.UserId {
		t.Errorf("user_id mismatch: got %q want %q", resp.UserId, owner.UserId)
	}
	if resp.DeviceName != "phone" {
		t.Errorf("device_name = %q, want phone", resp.DeviceName)
	}
	if resp.UserName != "alice" {
		t.Errorf("user_name = %q, want alice", resp.UserName)
	}

	// Code is single-use.
	if _, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: code}); status.Code(err) != codes.NotFound {
		t.Errorf("want NotFound on second redeem, got %v", err)
	}
}

func TestRedeemPairingCode_EmptyRejected(t *testing.T) {
	s, _ := newUserFixture(t)
	_, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: ""})
	if status.Code(err) != codes.InvalidArgument {
		t.Errorf("want InvalidArgument, got %v", err)
	}
}

func TestRedeemPairingCode_AcceptsFormattedInput(t *testing.T) {
	s, q := newUserFixture(t)
	owner, _ := s.Register(context.Background(), &doxv1.RegisterRequest{UserName: "alice", DeviceName: "laptop"})
	code, err := authn.CreatePairingCode(context.Background(), q, owner.UserId, "phone", defaultTestTTL)
	if err != nil {
		t.Fatal(err)
	}
	formatted := authn.FormatCode(code)
	if _, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: formatted}); err != nil {
		t.Fatalf("redeem with %q failed: %v", formatted, err)
	}
}

func TestRegister_FirstUserGetsSeedTodos(t *testing.T) {
	s, q := newUserFixture(t)
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName:   "alice",
		DeviceName: "laptop",
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
	// DESC by created_at — "Welcome" is the newest seed and must sort first.
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
	// First user (owner) — gets seeded.
	if _, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "alice", DeviceName: "laptop",
	}); err != nil {
		t.Fatal(err)
	}
	// Open registration so the second register succeeds without an invite.
	if err := q.UpsertSetting(context.Background(), queries.UpsertSettingParams{
		Key: "registration_open", Value: "true",
	}); err != nil {
		t.Fatalf("open registration: %v", err)
	}
	resp, err := s.Register(context.Background(), &doxv1.RegisterRequest{
		UserName: "bob", DeviceName: "phone",
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

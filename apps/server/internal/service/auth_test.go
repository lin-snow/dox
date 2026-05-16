package service_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/admin"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/pair"
	"github.com/lin-snow/dox/apps/server/internal/service"
)

func newAuthFixture(t *testing.T) (*service.AuthService, *queries.Queries) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	return service.NewAuthService(q), q
}

func TestRedeemPairingCode(t *testing.T) {
	t.Run("happy path", func(t *testing.T) {
		s, q := newAuthFixture(t)
		ctx := context.Background()
		code, err := admin.CreatePairingCode(ctx, q, "laptop", time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := s.RedeemPairingCode(ctx, &doxv1.RedeemPairingCodeRequest{Code: code})
		if err != nil {
			t.Fatal(err)
		}
		if resp.Token == "" || resp.DeviceId == "" || resp.DeviceName != "laptop" {
			t.Errorf("unexpected response: %+v", resp)
		}
		// Token must be the plaintext bearer; its sha256 should now exist in
		// device_tokens.
		dev, err := q.FindDeviceByTokenHash(ctx, pair.HashToken(resp.Token))
		if err != nil {
			t.Fatalf("device token not stored: %v", err)
		}
		if dev.Name != "laptop" {
			t.Errorf("stored name = %q, want laptop", dev.Name)
		}
	})

	t.Run("accepts formatted input", func(t *testing.T) {
		s, q := newAuthFixture(t)
		ctx := context.Background()
		code, _ := admin.CreatePairingCode(ctx, q, "phone", time.Minute)
		formatted := pair.FormatCode(code) // "ABCD-EFGH"
		resp, err := s.RedeemPairingCode(ctx, &doxv1.RedeemPairingCodeRequest{Code: formatted})
		if err != nil {
			t.Fatalf("redeem with formatted code failed: %v", err)
		}
		if resp.DeviceName != "phone" {
			t.Errorf("DeviceName = %q, want phone", resp.DeviceName)
		}
	})

	t.Run("single use", func(t *testing.T) {
		s, q := newAuthFixture(t)
		ctx := context.Background()
		code, _ := admin.CreatePairingCode(ctx, q, "laptop", time.Minute)
		if _, err := s.RedeemPairingCode(ctx, &doxv1.RedeemPairingCodeRequest{Code: code}); err != nil {
			t.Fatal(err)
		}
		_, err := s.RedeemPairingCode(ctx, &doxv1.RedeemPairingCodeRequest{Code: code})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound on second redemption, got %v", err)
		}
	})

	t.Run("expired", func(t *testing.T) {
		s, q := newAuthFixture(t)
		ctx := context.Background()
		// TTL of -1ms guarantees the code is already past expiry by the time
		// we try to consume it.
		code, _ := admin.CreatePairingCode(ctx, q, "laptop", -time.Millisecond)
		_, err := s.RedeemPairingCode(ctx, &doxv1.RedeemPairingCodeRequest{Code: code})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound on expired code, got %v", err)
		}
	})

	t.Run("unknown code", func(t *testing.T) {
		s, _ := newAuthFixture(t)
		_, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: "NOSUCHCODE"})
		if status.Code(err) != codes.NotFound {
			t.Errorf("want NotFound, got %v", err)
		}
	})

	t.Run("empty code rejected", func(t *testing.T) {
		s, _ := newAuthFixture(t)
		_, err := s.RedeemPairingCode(context.Background(), &doxv1.RedeemPairingCodeRequest{Code: ""})
		if status.Code(err) != codes.InvalidArgument {
			t.Errorf("want InvalidArgument, got %v", err)
		}
	})
}

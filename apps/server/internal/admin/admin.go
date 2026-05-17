// Package admin holds the operations behind the `dox-server` subcommands
// (pair, device list, device revoke). They share the SQLite database with the
// running HTTP server but never call into it — admin runs locally, separately.
package admin

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/pair"
)

var ErrDeviceNotFound = errors.New("device not found")

// CreatePairingCode issues a fresh code with the given TTL and persists it for
// the running server to consume. Returns the canonical (un-hyphenated) code.
func CreatePairingCode(ctx context.Context, q *queries.Queries, name string, ttl time.Duration) (string, error) {
	if name == "" {
		return "", errors.New("device name is required")
	}
	code, err := pair.GenerateCode()
	if err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	expires := time.Now().UTC().Add(ttl).UnixMilli()
	if err := q.CreatePairingCode(ctx, queries.CreatePairingCodeParams{
		Code:      code,
		Name:      name,
		ExpiresAt: expires,
	}); err != nil {
		return "", fmt.Errorf("store code: %w", err)
	}
	return code, nil
}

func ListDevices(ctx context.Context, q *queries.Queries) ([]queries.DeviceToken, error) {
	return q.ListDeviceTokens(ctx)
}

func RevokeDevice(ctx context.Context, q *queries.Queries, id string) error {
	n, err := q.DeleteDeviceToken(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrDeviceNotFound
	}
	return nil
}

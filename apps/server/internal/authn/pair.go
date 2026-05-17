package authn

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// CreatePairingCode issues a fresh code with the given TTL, bound to the user
// the new device will belong to. Returns the canonical (un-hyphenated) code.
func CreatePairingCode(ctx context.Context, q *queries.Queries, userID, name string, ttl time.Duration) (string, error) {
	if userID == "" {
		return "", errors.New("user id is required")
	}
	if name == "" {
		return "", errors.New("device name is required")
	}
	code, err := GenerateCode()
	if err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	expires := time.Now().UTC().Add(ttl).UnixMilli()
	if err := q.CreatePairingCode(ctx, queries.CreatePairingCodeParams{
		Code:      code,
		UserID:    userID,
		Name:      name,
		ExpiresAt: expires,
	}); err != nil {
		return "", fmt.Errorf("store code: %w", err)
	}
	return code, nil
}

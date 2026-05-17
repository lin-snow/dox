package authn

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// settingJWTSecret is the settings.key under which we persist the auto-
// generated signing secret. The env var DOX_JWT_SECRET overrides this at
// runtime — useful for sharing a secret across replicas (not the default
// self-host use case) or rotating without rewriting the DB.
const settingJWTSecret = "jwt_secret"

const secretLen = 32

// LoadOrCreateJWTSecret returns the signing secret. Resolution order:
//  1. DOX_JWT_SECRET env var (base64-encoded). Wins if set + non-empty.
//  2. settings.jwt_secret row in the DB.
//  3. Auto-generate a fresh 32-byte secret, persist it, and return it.
//
// Restarting with a different secret in DOX_JWT_SECRET invalidates every
// outstanding token — the documented "nuclear logout" for owners.
func LoadOrCreateJWTSecret(ctx context.Context, q *queries.Queries) ([]byte, error) {
	if env := os.Getenv("DOX_JWT_SECRET"); env != "" {
		raw, err := base64.StdEncoding.DecodeString(env)
		if err != nil {
			return nil, fmt.Errorf("authn: DOX_JWT_SECRET must be base64: %w", err)
		}
		if len(raw) < 16 {
			return nil, errors.New("authn: DOX_JWT_SECRET must decode to at least 16 bytes")
		}
		return raw, nil
	}

	stored, err := q.GetSetting(ctx, settingJWTSecret)
	if err == nil && stored != "" {
		raw, decErr := base64.StdEncoding.DecodeString(stored)
		if decErr == nil && len(raw) >= 16 {
			return raw, nil
		}
		// Stored value is corrupt — fall through and regenerate.
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("authn: read jwt secret: %w", err)
	}

	raw := make([]byte, secretLen)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("authn: generate jwt secret: %w", err)
	}
	if err := q.UpsertSetting(ctx, queries.UpsertSettingParams{
		Key:   settingJWTSecret,
		Value: base64.StdEncoding.EncodeToString(raw),
	}); err != nil {
		return nil, fmt.Errorf("authn: persist jwt secret: %w", err)
	}
	return raw, nil
}

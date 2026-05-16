package server

import (
	"context"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// deviceVerifier adapts *queries.Queries to auth.DeviceVerifier.
type deviceVerifier struct {
	q *queries.Queries
}

func (v *deviceVerifier) VerifyDeviceToken(ctx context.Context, hash string) (string, bool) {
	d, err := v.q.FindDeviceByTokenHash(ctx, hash)
	if err != nil {
		return "", false
	}
	return d.ID, true
}

func (v *deviceVerifier) TouchDevice(ctx context.Context, id string) {
	_ = v.q.TouchDeviceLastSeen(ctx, queries.TouchDeviceLastSeenParams{
		ID:         id,
		LastSeenAt: time.Now().UTC().UnixMilli(),
	})
}

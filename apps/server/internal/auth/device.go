package auth

import (
	"context"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// Verifier is the production DeviceVerifier — it looks up a device by token
// hash (which JOINs users to obtain role) and stamps last_seen_at on every
// authenticated request.
type Verifier struct {
	q *queries.Queries
}

func NewVerifier(q *queries.Queries) *Verifier {
	return &Verifier{q: q}
}

func (v *Verifier) VerifyDeviceToken(ctx context.Context, hash string) (CallerInfo, bool) {
	row, err := v.q.FindDeviceByTokenHash(ctx, hash)
	if err != nil {
		return CallerInfo{}, false
	}
	user, err := v.q.GetUserByID(ctx, row.UserID)
	if err != nil {
		return CallerInfo{}, false
	}
	return CallerInfo{
		DeviceID: row.ID,
		UserID:   row.UserID,
		UserName: user.Name,
		Role:     row.UserRole,
	}, true
}

func (v *Verifier) TouchDevice(ctx context.Context, id string) {
	_ = v.q.TouchDeviceLastSeen(ctx, queries.TouchDeviceLastSeenParams{
		ID:         id,
		LastSeenAt: time.Now().UTC().UnixMilli(),
	})
}

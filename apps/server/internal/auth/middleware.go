package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/lin-snow/dox/apps/server/internal/authctx"
)

// publicPaths skip authentication. Register and RedeemPairingCode are the only
// two entry points reachable without a bearer token; everything else requires
// a valid device token.
var publicPaths = map[string]bool{
	"/v1/auth/register": true,
	"/v1/auth/redeem":   true,
}

// CallerInfo is what the verifier returns on a successful device-token lookup.
// It carries everything middleware needs to populate the request context.
type CallerInfo struct {
	DeviceID string
	UserID   string
	UserName string
	Role     string
}

// DeviceVerifier looks up a device by its token's SHA-256 hash and pings its
// last_seen_at. Implementations live next to the database layer.
type DeviceVerifier interface {
	VerifyDeviceToken(ctx context.Context, tokenHash string) (CallerInfo, bool)
	TouchDevice(ctx context.Context, deviceID string)
}

// Middleware validates Authorization: Bearer <token> against the device_tokens
// table and injects the resolved Caller into the request context. Public paths
// (Register, RedeemPairingCode) skip authentication entirely.
func Middleware(devices DeviceVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if publicPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			header := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				unauthorized(w)
				return
			}
			info, ok := devices.VerifyDeviceToken(r.Context(), HashToken(token))
			if !ok {
				unauthorized(w)
				return
			}
			devices.TouchDevice(r.Context(), info.DeviceID)
			ctx := authctx.With(r.Context(), authctx.Caller{
				UserID:   info.UserID,
				UserName: info.UserName,
				Role:     info.Role,
				DeviceID: info.DeviceID,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

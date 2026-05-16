package auth

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/lin-snow/dox/apps/server/internal/pair"
)

// publicPaths skip authentication. /v1/auth/redeem is the bootstrap entry point
// for fresh devices; everything else requires a bearer token.
var publicPaths = map[string]bool{
	"/v1/auth/redeem": true,
}

// DeviceVerifier looks up a device by its token's SHA-256 hash and pings its
// last_seen_at. Implementations live next to the database layer.
type DeviceVerifier interface {
	VerifyDeviceToken(ctx context.Context, tokenHash string) (deviceID string, ok bool)
	TouchDevice(ctx context.Context, deviceID string)
}

// Middleware validates Authorization: Bearer <token> against either the env
// bootstrap token (admin override) or a per-device token from the
// device_tokens table.
func Middleware(bootstrapToken string, devices DeviceVerifier) func(http.Handler) http.Handler {
	expectedBootstrap := []byte("Bearer " + bootstrapToken)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if publicPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			header := r.Header.Get("Authorization")
			if header == "" {
				unauthorized(w)
				return
			}

			if subtle.ConstantTimeCompare([]byte(header), expectedBootstrap) == 1 {
				next.ServeHTTP(w, r)
				return
			}

			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				unauthorized(w)
				return
			}
			id, ok := devices.VerifyDeviceToken(r.Context(), pair.HashToken(token))
			if !ok {
				unauthorized(w)
				return
			}
			devices.TouchDevice(r.Context(), id)
			next.ServeHTTP(w, r)
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

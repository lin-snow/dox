package authn

import (
	"context"
	"net/http"
	"strings"

	"github.com/lin-snow/dox/apps/server/internal/caller"
)

// publicPaths skip authentication. ServerInfo, Register, and RedeemPairingCode
// are the only entry points reachable without a bearer token; everything else
// requires a valid device token.
var publicPaths = map[string]bool{
	"/v1/auth/server-info": true,
	"/v1/auth/register":    true,
	"/v1/auth/redeem":      true,
}

// DeviceVerifier looks up a device by its token's SHA-256 hash, returning the
// caller bound to that device. The verifier implementation lives next to the
// database layer.
type DeviceVerifier interface {
	VerifyDeviceToken(ctx context.Context, tokenHash string) (caller.Caller, bool)
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
			c, ok := devices.VerifyDeviceToken(r.Context(), HashToken(token))
			if !ok {
				unauthorized(w)
				return
			}
			devices.TouchDevice(r.Context(), c.DeviceID)
			next.ServeHTTP(w, r.WithContext(caller.With(r.Context(), c)))
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

package authn

import (
	"net/http"
	"strings"

	"github.com/lin-snow/dox/apps/server/internal/caller"
)

// publicPaths skip authentication. ServerInfo, Register, and Login are the
// only entry points reachable without a bearer token; everything else
// requires a valid JWT.
var publicPaths = map[string]bool{
	"/v1/auth/server-info": true,
	"/v1/auth/register":    true,
	"/v1/auth/login":       true,
}

// TokenVerifier parses an Authorization: Bearer string and returns the
// caller it identifies. JWTVerifier is the production implementation.
type TokenVerifier interface {
	Verify(raw string) (caller.Caller, bool)
}

// Middleware validates Authorization: Bearer <jwt> via the supplied
// TokenVerifier and injects the resolved Caller into the request context.
// Public paths skip authentication entirely.
func Middleware(v TokenVerifier) func(http.Handler) http.Handler {
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
			c, ok := v.Verify(token)
			if !ok {
				unauthorized(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(caller.With(r.Context(), c)))
		})
	}
}

func unauthorized(w http.ResponseWriter) {
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

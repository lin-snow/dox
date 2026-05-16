package auth

import (
	"crypto/subtle"
	"net/http"
)

// Middleware enforces Authorization: Bearer <token> on all requests.
//
// v0.x validates against the env bootstrap token only. M4 (Pairing Code Flow)
// extends this to also accept device tokens looked up from the device_tokens
// table.
func Middleware(bootstrapToken string) func(http.Handler) http.Handler {
	expected := []byte("Bearer " + bootstrapToken)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := []byte(r.Header.Get("Authorization"))
			if subtle.ConstantTimeCompare(got, expected) != 1 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

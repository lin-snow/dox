package auth

import (
	"crypto/subtle"
	"net/http"
)

// Middleware enforces Authorization: Bearer <token> on every request.
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

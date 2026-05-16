package auth_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/auth"
)

func TestMiddleware(t *testing.T) {
	const token = "test-token-with-enough-entropy-12345"

	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := auth.Middleware(token)(ok)

	tests := []struct {
		name       string
		authHeader string
		wantStatus int
	}{
		{"valid", "Bearer " + token, http.StatusOK},
		{"missing header", "", http.StatusUnauthorized},
		{"wrong token", "Bearer wrong-token", http.StatusUnauthorized},
		{"wrong scheme", "Basic " + token, http.StatusUnauthorized},
		{"empty bearer", "Bearer ", http.StatusUnauthorized},
		{"case sensitive", "bearer " + token, http.StatusUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/v1/todos", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Errorf("want %d, got %d", tt.wantStatus, rec.Code)
			}
		})
	}
}

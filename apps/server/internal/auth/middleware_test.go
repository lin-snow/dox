package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/auth"
	"github.com/lin-snow/dox/apps/server/internal/pair"
)

type fakeDevices struct {
	hashToID map[string]string
	touched  []string
}

func (f *fakeDevices) VerifyDeviceToken(_ context.Context, hash string) (string, bool) {
	id, ok := f.hashToID[hash]
	return id, ok
}

func (f *fakeDevices) TouchDevice(_ context.Context, id string) {
	f.touched = append(f.touched, id)
}

func TestMiddleware(t *testing.T) {
	const bootstrap = "test-token-with-enough-entropy-12345"
	deviceToken := "device-token-abc"

	devices := &fakeDevices{
		hashToID: map[string]string{
			pair.HashToken(deviceToken): "device-1",
		},
	}

	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := auth.Middleware(bootstrap, devices)(ok)

	tests := []struct {
		name       string
		path       string
		authHeader string
		wantStatus int
	}{
		{"bootstrap valid", "/v1/todos", "Bearer " + bootstrap, http.StatusOK},
		{"device token valid", "/v1/todos", "Bearer " + deviceToken, http.StatusOK},
		{"missing header", "/v1/todos", "", http.StatusUnauthorized},
		{"unknown token", "/v1/todos", "Bearer nope", http.StatusUnauthorized},
		{"wrong scheme", "/v1/todos", "Basic " + bootstrap, http.StatusUnauthorized},
		{"empty bearer", "/v1/todos", "Bearer ", http.StatusUnauthorized},
		{"public redeem with no header", "/v1/auth/redeem", "", http.StatusOK},
		{"public redeem with bogus token", "/v1/auth/redeem", "Bearer nope", http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
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

	// Device-token requests should bump last_seen_at; bootstrap should not
	// (we don't track the admin override).
	if len(devices.touched) != 1 || devices.touched[0] != "device-1" {
		t.Errorf("want touched=[device-1], got %v", devices.touched)
	}
}

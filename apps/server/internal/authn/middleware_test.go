package authn_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/caller"
)

type fakeDevices struct {
	hashToCaller map[string]caller.Caller
	touched      []string
}

func (f *fakeDevices) VerifyDeviceToken(_ context.Context, hash string) (caller.Caller, bool) {
	c, ok := f.hashToCaller[hash]
	return c, ok
}

func (f *fakeDevices) TouchDevice(_ context.Context, id string) {
	f.touched = append(f.touched, id)
}

func TestMiddleware(t *testing.T) {
	const deviceToken = "device-token-abc"
	want := caller.Caller{
		DeviceID: "device-1",
		UserID:   "user-1",
		UserName: "alice",
		Role:     caller.RoleOwner,
	}
	devices := &fakeDevices{
		hashToCaller: map[string]caller.Caller{authn.HashToken(deviceToken): want},
	}

	var seenCaller caller.Caller
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCaller, _ = caller.From(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authn.Middleware(devices)(upstream)

	tests := []struct {
		name       string
		method     string
		path       string
		authHeader string
		wantStatus int
	}{
		{"public server-info", "GET", "/v1/auth/server-info", "", http.StatusOK},
		{"public register", "POST", "/v1/auth/register", "", http.StatusOK},
		{"public redeem", "POST", "/v1/auth/redeem", "", http.StatusOK},
		{"protected with valid token", "GET", "/v1/todos", "Bearer " + deviceToken, http.StatusOK},
		{"protected missing header", "GET", "/v1/todos", "", http.StatusUnauthorized},
		{"protected unknown token", "GET", "/v1/todos", "Bearer nope", http.StatusUnauthorized},
		{"protected wrong scheme", "GET", "/v1/todos", "Basic anything", http.StatusUnauthorized},
		{"protected empty bearer", "GET", "/v1/todos", "Bearer ", http.StatusUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seenCaller = caller.Caller{}
			req := httptest.NewRequest(tt.method, tt.path, nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Errorf("want status %d, got %d", tt.wantStatus, rec.Code)
			}
		})
	}

	// One last protected request to verify the caller-context is propagated.
	req := httptest.NewRequest("GET", "/v1/todos", nil)
	req.Header.Set("Authorization", "Bearer "+deviceToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if seenCaller.UserID != want.UserID || seenCaller.Role != want.Role {
		t.Errorf("caller not propagated: got %+v", seenCaller)
	}
	if len(devices.touched) == 0 || devices.touched[len(devices.touched)-1] != want.DeviceID {
		t.Errorf("device not touched: %v", devices.touched)
	}
}

package auth_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/auth"
	"github.com/lin-snow/dox/apps/server/internal/authctx"
)

type fakeDevices struct {
	hashToInfo map[string]auth.CallerInfo
	touched    []string
}

func (f *fakeDevices) VerifyDeviceToken(_ context.Context, hash string) (auth.CallerInfo, bool) {
	info, ok := f.hashToInfo[hash]
	return info, ok
}

func (f *fakeDevices) TouchDevice(_ context.Context, id string) {
	f.touched = append(f.touched, id)
}

func TestMiddleware(t *testing.T) {
	const deviceToken = "device-token-abc"
	want := auth.CallerInfo{
		DeviceID: "device-1",
		UserID:   "user-1",
		UserName: "alice",
		Role:     authctx.RoleOwner,
	}
	devices := &fakeDevices{
		hashToInfo: map[string]auth.CallerInfo{auth.HashToken(deviceToken): want},
	}

	var seenCaller authctx.Caller
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCaller, _ = authctx.From(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := auth.Middleware(devices)(upstream)

	tests := []struct {
		name       string
		method     string
		path       string
		authHeader string
		wantStatus int
	}{
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
			seenCaller = authctx.Caller{}
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

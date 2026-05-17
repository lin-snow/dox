package authn_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/caller"
)

type fakeVerifier struct {
	hits map[string]caller.Caller
}

func (f *fakeVerifier) Verify(raw string) (caller.Caller, bool) {
	c, ok := f.hits[raw]
	return c, ok
}

func TestMiddleware(t *testing.T) {
	const token = "stub-jwt-abc"
	want := caller.Caller{
		UserID:   "user-1",
		UserName: "alice",
		Role:     caller.RoleOwner,
	}
	v := &fakeVerifier{hits: map[string]caller.Caller{token: want}}

	var seenCaller caller.Caller
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCaller, _ = caller.From(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	handler := authn.Middleware(v)(upstream)

	tests := []struct {
		name       string
		method     string
		path       string
		authHeader string
		wantStatus int
	}{
		{"public server-info", "GET", "/v1/auth/server-info", "", http.StatusOK},
		{"public register", "POST", "/v1/auth/register", "", http.StatusOK},
		{"public login", "POST", "/v1/auth/login", "", http.StatusOK},
		{"protected with valid token", "GET", "/v1/todos", "Bearer " + token, http.StatusOK},
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
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if seenCaller.UserID != want.UserID || seenCaller.Role != want.Role {
		t.Errorf("caller not propagated: got %+v", seenCaller)
	}
}

func TestJWTRoundTrip(t *testing.T) {
	secret := []byte("test-secret-at-least-16-bytes-long")
	token, err := authn.IssueToken(secret, "u-1", "alice", caller.RoleOwner, authn.DefaultTokenTTL)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	v := authn.NewJWTVerifier(secret)
	c, ok := v.Verify(token)
	if !ok {
		t.Fatalf("verify failed on freshly issued token")
	}
	if c.UserID != "u-1" || c.UserName != "alice" || c.Role != caller.RoleOwner {
		t.Errorf("caller mismatch: %+v", c)
	}

	// Wrong secret rejects.
	bad := authn.NewJWTVerifier([]byte("other-secret-at-least-16-bytes!!"))
	if _, ok := bad.Verify(token); ok {
		t.Error("token verified under wrong secret")
	}
}

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := authn.HashPassword("hunter22-strong")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !authn.VerifyPassword("hunter22-strong", hash) {
		t.Error("VerifyPassword rejected the correct password")
	}
	if authn.VerifyPassword("wrong-password", hash) {
		t.Error("VerifyPassword accepted the wrong password")
	}
	if _, err := authn.HashPassword("short"); err == nil {
		t.Error("HashPassword should reject < MinPasswordLen")
	}
}

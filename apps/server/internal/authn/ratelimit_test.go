package authn

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_BurstThenRefill(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	l := newRateLimiter(0.5, 2, false)
	l.now = func() time.Time { return now }

	for i := range 2 {
		if !l.Allow("ip|/v1/auth/login") {
			t.Fatalf("burst attempt %d should pass", i+1)
		}
	}
	if l.Allow("ip|/v1/auth/login") {
		t.Fatal("third attempt inside the same second should be rejected")
	}
	if !l.Allow("other|/v1/auth/login") {
		t.Fatal("buckets must be per key")
	}

	now = now.Add(2 * time.Second) // 0.5/s * 2s = 1 token
	if !l.Allow("ip|/v1/auth/login") {
		t.Fatal("refilled token should pass")
	}
	if l.Allow("ip|/v1/auth/login") {
		t.Fatal("only one token should have refilled")
	}
}

func TestRateLimiter_MiddlewareOnlyGuardsAuthEndpoints(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	l := newRateLimiter(0.0, 1, false)
	l.now = func() time.Time { return now }

	var hits int
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ })
	h := l.Middleware(next)

	do := func(method, path, remote string) int {
		req := httptest.NewRequest(method, path, nil)
		req.RemoteAddr = remote
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	if got := do(http.MethodPost, "/v1/auth/login", "203.0.113.7:5555"); got != http.StatusOK {
		t.Fatalf("first login: want 200, got %d", got)
	}
	if got := do(http.MethodPost, "/v1/auth/login", "203.0.113.7:6666"); got != http.StatusTooManyRequests {
		t.Fatalf("second login: want 429, got %d", got)
	}
	if got := do(http.MethodGet, "/v1/me", "203.0.113.7:5555"); got != http.StatusOK {
		t.Fatalf("non-auth path must bypass the limiter, got %d", got)
	}
	if hits != 2 {
		t.Fatalf("upstream should see the first login and /v1/me, got %d", hits)
	}
}

func TestRateLimiter_TrustProxyUsesForwardedFor(t *testing.T) {
	l := newRateLimiter(1, 1, true)
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/login", nil)
	req.RemoteAddr = "127.0.0.1:5000"
	req.Header.Set("X-Forwarded-For", "198.51.100.9, 10.0.0.2")
	if got := l.clientKey(req); got != "198.51.100.9" {
		t.Fatalf("clientKey = %q, want leftmost forwarded address", got)
	}

	untrusted := newRateLimiter(1, 1, false)
	if got := untrusted.clientKey(req); got != "127.0.0.1" {
		t.Fatalf("untrusted clientKey = %q, want remote addr", got)
	}
}

func TestRateLimiter_SweepsIdleBuckets(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	l := newRateLimiter(1, 1, false)
	l.now = func() time.Time { return now }
	l.Allow("old|/v1/auth/login")

	now = now.Add(rateLimitIdleTTL + time.Second)
	l.Allow("new|/v1/auth/login")

	if _, ok := l.buckets["old|/v1/auth/login"]; ok {
		t.Fatal("idle bucket should have been swept")
	}
	if _, ok := l.buckets["new|/v1/auth/login"]; !ok {
		t.Fatal("active bucket should remain")
	}
}

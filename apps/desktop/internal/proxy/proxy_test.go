package proxy_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/lin-snow/dox/apps/desktop/internal/proxy"
)

type observed struct {
	method string
	path   string
	query  string
	auth   string
	cookie string
	body   string
}

func newUpstream(t *testing.T, reply func(w http.ResponseWriter, r *http.Request)) (*httptest.Server, *observed) {
	t.Helper()
	seen := &observed{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen.method = r.Method
		seen.path = r.URL.Path
		seen.query = r.URL.RawQuery
		seen.auth = r.Header.Get("Authorization")
		seen.cookie = r.Header.Get("Cookie")
		seen.body = string(body)
		reply(w, r)
	}))
	t.Cleanup(server.Close)
	return server, seen
}

func baseOf(t *testing.T, server *httptest.Server) *url.URL {
	t.Helper()
	parsed, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse upstream: %v", err)
	}
	return parsed
}

func TestProxyForwardsAndInjectsToken(t *testing.T) {
	upstream, seen := newUpstream(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"todos":[]}`))
	})

	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return baseOf(t, upstream) },
		Token: func() string { return "secret-token" },
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/todos?project_id=abc", nil)
	// A page-supplied credential must never reach the server.
	req.Header.Set("Authorization", "Bearer forged")
	req.Header.Set("Cookie", "session=forged")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := seen.path; got != "/v1/todos" {
		t.Errorf("path = %q, want /v1/todos", got)
	}
	if got := seen.query; got != "project_id=abc" {
		t.Errorf("query = %q, want project_id=abc", got)
	}
	if got := seen.auth; got != "Bearer secret-token" {
		t.Errorf("authorization = %q, want the injected token", got)
	}
	if got := seen.cookie; got != "" {
		t.Errorf("cookie = %q, want it stripped", got)
	}
	if got := rec.Body.String(); got != `{"todos":[]}` {
		t.Errorf("body = %q, want the upstream body verbatim", got)
	}
}

func TestProxyForwardsMethodAndBody(t *testing.T) {
	upstream, seen := newUpstream(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return baseOf(t, upstream) },
		Token: func() string { return "t" },
	})

	req := httptest.NewRequest(http.MethodPatch, "/v1/todos/01ABC", strings.NewReader(`{"done":true}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if seen.method != http.MethodPatch {
		t.Errorf("method = %q, want PATCH", seen.method)
	}
	if seen.body != `{"done":true}` {
		t.Errorf("body = %q, want the request body", seen.body)
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
}

func TestProxyOmitsAuthorizationWhenSignedOut(t *testing.T) {
	upstream, seen := newUpstream(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":16,"message":"unauthorized"}`))
	})
	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return baseOf(t, upstream) },
		Token: func() string { return "" },
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer stale")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if seen.auth != "" {
		t.Errorf("authorization = %q, want none", seen.auth)
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want the upstream 401 passed through", rec.Code)
	}
	if got := rec.Body.String(); !strings.Contains(got, `"code":16`) {
		t.Errorf("body = %q, want the upstream error envelope verbatim", got)
	}
}

func TestProxyRefusesUnconfiguredServer(t *testing.T) {
	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return nil },
		Token: func() string { return "" },
	})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/todos", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if got := rec.Body.String(); !strings.Contains(got, `"code":14`) {
		t.Errorf("body = %q, want a grpc-style unavailable envelope", got)
	}
}

func TestProxyIsNotAGeneralForwarder(t *testing.T) {
	upstream, _ := newUpstream(t, func(w http.ResponseWriter, r *http.Request) {})
	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return baseOf(t, upstream) },
		Token: func() string { return "t" },
	})

	for _, path := range []string{"/", "/__dox/session", "/v1"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s status = %d, want 404", path, rec.Code)
		}
	}
}

func TestProxyRewritesPrefixedBase(t *testing.T) {
	upstream, seen := newUpstream(t, func(w http.ResponseWriter, r *http.Request) {})
	base := baseOf(t, upstream)
	base.Path = "/dox"

	handler := proxy.New(proxy.Options{
		Base:  func() *url.URL { return base },
		Token: func() string { return "t" },
	})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if seen.path != "/dox/healthz" {
		t.Errorf("path = %q, want /dox/healthz", seen.path)
	}
}

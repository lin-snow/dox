package webui_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/webui"
)

func serve(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func TestHandlerServesIndexAtRoot(t *testing.T) {
	rec := serve(webui.Handler(), http.MethodGet, "/")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Errorf("content-type = %q, want text/html", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache-control = %q, want no-store", got)
	}
	// The page is worthless without its module entry point.
	if body := rec.Body.String(); !strings.Contains(body, `src="/static/app.js"`) {
		t.Errorf("index.html does not reference /static/app.js")
	}
}

func TestHandlerDoesNotFallBackToIndex(t *testing.T) {
	// A catch-all would shadow any route mounted after this handler, so
	// unknown paths must 404 rather than render the page.
	if rec := serve(webui.Handler(), http.MethodGet, "/nope"); rec.Code != http.StatusNotFound {
		t.Errorf("GET /nope status = %d, want 404", rec.Code)
	}
}

func TestHandlerLeavesAPIPathsAlone(t *testing.T) {
	// /v1 is owned by the auth-wrapped gateway mux. If this package ever
	// answered here, it would bypass authentication.
	if rec := serve(webui.Handler(), http.MethodGet, "/v1/todos"); rec.Code != http.StatusNotFound {
		t.Errorf("GET /v1/todos status = %d, want 404", rec.Code)
	}
}

func TestHandlerServesEmbeddedAssets(t *testing.T) {
	h := webui.Handler()

	for _, tc := range []struct{ path, want string }{
		{"/static/app.js", "javascript"},
		{"/static/style.css", "text/css"},
	} {
		rec := serve(h, http.MethodGet, tc.path)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s status = %d, want 200", tc.path, rec.Code)
		}
		if got := rec.Header().Get("Content-Type"); !strings.Contains(got, tc.want) {
			t.Errorf("GET %s content-type = %q, want %q", tc.path, got, tc.want)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
			t.Errorf("GET %s cache-control = %q, want no-cache", tc.path, got)
		}
		if rec.Body.Len() == 0 {
			t.Errorf("GET %s served an empty body", tc.path)
		}
	}

	if rec := serve(h, http.MethodGet, "/static/missing.js"); rec.Code != http.StatusNotFound {
		t.Errorf("GET /static/missing.js status = %d, want 404", rec.Code)
	}
}

func TestHandlerRejectsNonReadMethods(t *testing.T) {
	// Static bytes are read-only; a POST must not reach the page handler.
	if rec := serve(webui.Handler(), http.MethodPost, "/"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST / status = %d, want 405", rec.Code)
	}
}

func TestHandlerSendsSecurityHeaders(t *testing.T) {
	h := webui.Handler()

	for _, path := range []string{"/", "/static/app.js"} {
		rec := serve(h, http.MethodGet, path)
		csp := rec.Header().Get("Content-Security-Policy")
		// The JWT sits in sessionStorage, so no inline script or style may
		// ever be allowed to run on this origin.
		for _, want := range []string{"default-src 'none'", "script-src 'self'", "frame-ancestors 'none'"} {
			if !strings.Contains(csp, want) {
				t.Errorf("GET %s CSP = %q, missing %q", path, csp, want)
			}
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("GET %s x-content-type-options = %q, want nosniff", path, got)
		}
		if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
			t.Errorf("GET %s x-frame-options = %q, want DENY", path, got)
		}
	}
}

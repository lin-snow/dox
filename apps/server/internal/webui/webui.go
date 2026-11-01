// Package webui serves the minimal, build-stepless web UI.
//
// Scope is deliberately frozen at "sign in, look at my todos, add one, tick
// one off, read one". This surface exists so a deployment is usable from any
// browser with zero installs; the full experience belongs in a real client.
// Growing this page into a second full client is the failure mode this
// comment exists to prevent — add it to apps/desktop instead.
//
// The page is public static bytes, so it is mounted outside the auth chain:
// it authenticates itself against /v1 with a bearer token kept in
// sessionStorage. That keeps authn.publicPaths at exactly three entries and
// avoids introducing cookies, and with them a CSRF surface.
package webui

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed static
var assets embed.FS

// contentSecurityPolicy: the page keeps its JWT in sessionStorage, so it must
// not be able to load or execute anything but its own two assets. Nothing in
// static/ uses inline scripts, inline styles, or eval, which is what lets the
// policy stay this tight.
const contentSecurityPolicy = "default-src 'none'; " +
	"script-src 'self'; style-src 'self'; " +
	"connect-src 'self'; img-src 'self' data:; " +
	"base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// Handler serves the two public routes: GET / (exactly) returns index.html and
// GET /static/... returns the embedded assets. Mount it on a ServeMux outside
// the auth middleware. Both patterns are method-qualified, so anything that is
// not a GET/HEAD falls through to the API mux.
//
// There is deliberately no fallback-to-index for unknown paths: this is a
// single page, not a client-routed app, and a catch-all would shadow any route
// added later.
func Handler() http.Handler {
	sub, err := fs.Sub(assets, "static")
	if err != nil {
		// Unreachable: "static" is embedded by the //go:embed directive above.
		panic("webui: embedded static directory missing: " + err.Error())
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", serveIndex(sub))
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(sub)))
	return withHeaders(mux)
}

func serveIndex(sub fs.FS) http.HandlerFunc {
	page, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		// Same reasoning as above: a missing index.html is a build error, not a
		// runtime condition we can degrade around.
		panic("webui: embedded index.html missing: " + err.Error())
	}
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(page)
	}
}

func withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		// Assets carry no content hash, so revalidate on every load. They are a
		// few KiB; index.html overrides this with no-store.
		h.Set("Cache-Control", "no-cache")
		next.ServeHTTP(w, r)
	})
}

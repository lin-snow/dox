// Package proxy forwards the webview's API calls to the configured dox server.
//
// Why a proxy instead of CORS: the webview is same-origin with itself, so the
// dox server needs no CORS middleware, no cookie, and no change to its auth
// allowlist. The proxy is also the one place that attaches the bearer token,
// which keeps the JWT out of JavaScript entirely.
package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Options wires the proxy to the live session. Both functions are called per
// request, so switching servers or signing out takes effect immediately.
type Options struct {
	Base  func() *url.URL
	Token func() string
}

// New returns a handler for /v1/... and /healthz only. Anything else 404s:
// this is deliberately not a general-purpose forward proxy.
func New(o Options) http.Handler {
	reverse := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			base := o.Base()
			pr.Out.URL.Scheme = base.Scheme
			pr.Out.URL.Host = base.Host
			pr.Out.Host = base.Host
			// Only rewrite the path when the server lives under a prefix; a bare
			// base keeps the request's own escaping (RawPath) intact.
			if prefix := strings.TrimSuffix(base.Path, "/"); prefix != "" {
				pr.Out.URL.Path = prefix + pr.Out.URL.Path
			}

			// Never forward the page's own Authorization or Cookie headers: the
			// token is the desktop app's, injected below. This is the credential
			// boundary between the renderer and the server.
			pr.Out.Header.Del("Authorization")
			pr.Out.Header.Del("Cookie")
			if token := o.Token(); token != "" {
				pr.Out.Header.Set("Authorization", "Bearer "+token)
			}
		},
		Transport: &http.Transport{
			// No ProxyFromEnvironment: a self-hosted server on the LAN or on
			// loopback must never be routed through a corporate proxy.
			MaxIdleConnsPerHost:   4,
			ResponseHeaderTimeout: 30 * time.Second,
			IdleConnTimeout:       90 * time.Second,
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			writeError(w, http.StatusBadGateway, 14, "cannot reach the dox server: "+err.Error())
		},
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.IsAbs() || r.URL.Host != "" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/healthz" && !strings.HasPrefix(r.URL.Path, "/v1/") {
			http.NotFound(w, r)
			return
		}
		if o.Base() == nil {
			writeError(w, http.StatusServiceUnavailable, 14, "no dox server configured")
			return
		}
		reverse.ServeHTTP(w, r)
	})
}

func writeError(w http.ResponseWriter, status, code int, message string) {
	// Same envelope grpc-gateway emits, so the SDK's ApiError renders it.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": code, "message": message})
}

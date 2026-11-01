package app

import (
	"net/http"
	"strings"

	"github.com/lin-snow/dox/apps/server/internal/handler"
)

// countChanges advances the WatchChanges counter for every committed write.
//
// The middleware is the only place that sees a request *after* its handler
// returned, and handlers return only once runInTx has committed (or the plain
// query succeeded). Bumping from inside a handler would wake long-polling
// clients before the transaction lands, and a client that refetches in that
// window would read pre-commit state and then wait forever for a change it
// already missed.
//
// Reads never bump. Auth endpoints are excluded so a sign-in on one device does
// not make every other client refetch, and rejected writes (401/403/404/409)
// bump nothing because the counter is only advanced on 2xx.
func countChanges(ch *handler.Changes, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet, r.Method == http.MethodHead,
			r.Method == http.MethodOptions,
			strings.HasPrefix(r.URL.Path, "/v1/auth/"):
			next.ServeHTTP(w, r)
			return
		}

		// Assume success until WriteHeader says otherwise: handlers that never
		// call it emit an implicit 200 with the body.
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if rec.status >= 200 && rec.status < 300 {
			ch.Bump()
		}
	})
}

// statusRecorder remembers the status code for the counter decision, and
// forwards Flush so wrapping does not silently disable streaming writers.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

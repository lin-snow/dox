package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/handler"
)

func TestCountChanges(t *testing.T) {
	tests := []struct {
		name    string
		method  string
		path    string
		status  int
		wantVer uint64
	}{
		{"create bumps", http.MethodPost, "/v1/todos", 200, 1},
		{"patch bumps", http.MethodPatch, "/v1/todos/x", 201, 1},
		{"delete bumps", http.MethodDelete, "/v1/todos/x", 204, 1},
		{"read never bumps", http.MethodGet, "/v1/todos", 200, 0},
		{"head never bumps", http.MethodHead, "/v1/todos", 200, 0},
		{"watch poll never bumps", http.MethodGet, "/v1/changes", 200, 0},
		{"login excluded", http.MethodPost, "/v1/auth/login", 200, 0},
		{"rejected write never bumps", http.MethodPost, "/v1/todos", 403, 0},
		{"validation error never bumps", http.MethodPatch, "/v1/todos/x", 400, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ch := handler.NewChanges()
			h := countChanges(ch, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
			}))
			h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tt.method, tt.path, nil))
			if got := ch.Current(); got != tt.wantVer {
				t.Fatalf("version = %d, want %d", got, tt.wantVer)
			}
		})
	}
}

// A handler that writes a body without calling WriteHeader is a successful
// write, and must still wake watchers.
func TestCountChangesImplicit200Bumps(t *testing.T) {
	ch := handler.NewChanges()
	h := countChanges(ch, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/v1/todos", nil))
	if got := ch.Current(); got != 1 {
		t.Fatalf("version = %d, want 1", got)
	}
}

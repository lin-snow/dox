package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	"github.com/lin-snow/dox/apps/server/internal/db"
)

func TestHealthHandler_OK(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "health.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer func() { _ = conn.Close() }()

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		rec := httptest.NewRecorder()
		healthHandler(conn)(rec, httptest.NewRequest(method, "/healthz", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s /healthz: want 200, got %d", method, rec.Code)
		}
		if method == http.MethodGet {
			var body healthResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if body.Status != "ok" {
				t.Errorf("status = %q, want ok", body.Status)
			}
		}
	}
}

func TestHealthHandler_UnavailableWhenDBClosed(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "health.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	if err := conn.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	rec := httptest.NewRecorder()
	healthHandler(conn)(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503 for closed db, got %d", rec.Code)
	}
}

func TestHealthHandler_RejectsNonProbeMethods(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "health.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer func() { _ = conn.Close() }()

	rec := httptest.NewRecorder()
	healthHandler(conn)(rec, httptest.NewRequest(http.MethodPost, "/healthz", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405, got %d", rec.Code)
	}
}

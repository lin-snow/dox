package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

const healthPingTimeout = 2 * time.Second

type healthResponse struct {
	Status string `json:"status"`
}

// healthHandler reports process + database readiness. It is mounted outside
// the auth middleware so orchestrators can probe it without a token.
func healthHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), healthPingTimeout)
		defer cancel()

		status := http.StatusOK
		body := healthResponse{Status: "ok"}
		if err := db.PingContext(ctx); err != nil {
			status = http.StatusServiceUnavailable
			body.Status = "unavailable"
			slog.Warn("health check failed", "err", err)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(body); err != nil {
			slog.Debug("write health response", "err", err)
		}
	}
}

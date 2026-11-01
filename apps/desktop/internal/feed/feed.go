// Package feed polls the reminder ledger and turns new rows into native
// notifications.
//
// Polling, not push: that is the contract the server publishes (see
// apps/server/internal/notifier — "the in-app channel needs no implementation:
// clients poll ListNotifications"). The ledger is durable and idempotent, so
// the only job here is to never announce the same row twice.
package feed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// Reminder is the subset of a notification row the desktop needs.
type Reminder struct {
	ID        string `json:"id"`
	TodoID    string `json:"todoId"`
	TodoTitle string `json:"todoTitle"`
	Kind      string `json:"kind"`
}

// Source reads the caller's unread reminders.
type Source interface {
	Unread(ctx context.Context) (reminders []Reminder, unread int, err error)
}

// Sink is the platform side: a native notification plus the tray badge.
type Sink interface {
	Notify(reminder Reminder)
	Unread(count int)
}

// Config tunes the loop.
type Config struct {
	// Interval between polls. <= 0 disables the loop entirely.
	Interval time.Duration
	// Enabled reports whether polling should happen right now (signed in, and
	// the user has not switched notifications off).
	Enabled func() bool
}

// Run blocks until ctx is cancelled. A single instance sweeps, mirroring the
// server's own notifier goroutine.
func Run(ctx context.Context, source Source, sink Sink, cfg Config) {
	if cfg.Interval <= 0 {
		return
	}
	seen := make(map[string]struct{})

	tick := func() {
		if cfg.Enabled != nil && !cfg.Enabled() {
			return
		}
		reminders, unread, err := source.Unread(ctx)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				slog.Debug("reminder poll failed", "err", err)
			}
			return
		}
		sink.Unread(unread)
		for _, reminder := range reminders {
			if _, dup := seen[reminder.ID]; dup {
				continue
			}
			seen[reminder.ID] = struct{}{}
			sink.Notify(reminder)
		}
		// The ledger only grows while reminders fire; keep the set bounded for
		// long-running sessions where the app is never restarted.
		if len(seen) > 1024 {
			seen = make(map[string]struct{})
		}
	}

	tick()
	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tick()
		}
	}
}

// ErrNoServer means the app has not been pointed at a server yet.
var ErrNoServer = errors.New("no dox server configured")

// HTTPSource reads the ledger directly from the server. It does not go through
// the local proxy: the poller runs in Go, already owns the token, and adding a
// request hop would only make failures harder to attribute.
type HTTPSource struct {
	Client *http.Client
	// Base and Token are read per call so sign-in and server switches apply
	// immediately.
	Base  func() string
	Token func() string
}

func (s HTTPSource) Unread(ctx context.Context) ([]Reminder, int, error) {
	base := s.Base()
	if base == "" {
		return nil, 0, ErrNoServer
	}
	url := base + "/v1/notifications?unread_only=true&limit=20"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	if token := s.Token(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := s.Client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("reminder poll: %s", res.Status)
	}

	var body struct {
		Notifications []Reminder `json:"notifications"`
		UnreadCount   int        `json:"unreadCount"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, 0, err
	}
	return body.Notifications, body.UnreadCount, nil
}

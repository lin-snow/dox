package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// The desktop keeps its own windows in step with the server by long-polling
// the change counter and telling every open window to refetch.
//
// Why not push from the server straight into the webview: the webview is
// same-origin with this process, not with the server (see AGENTS.md — the
// renderer never holds the token), so a server-side stream would have to be
// proxied anyway. Polling the counter here means the renderer keeps zero
// knowledge of the transport, and one HTTP request replaces per-view polling.
const (
	// Slightly under the server's own 25s default, so the server never has to
	// answer a poll that the client already gave up on.
	watchTimeoutMS = 20_000
	// Must exceed the long-poll budget or every poll would time out locally.
	watchClientTimeout = 35 * time.Second
	watchRetryDelay    = time.Second
	watchMaxBackoff    = 30 * time.Second
)

// versionSource is the one thing the loop needs; tests substitute it.
type versionSource interface {
	Version(ctx context.Context, since uint64) (uint64, error)
}

// changeSource reads the counter through the same credentials the feed uses.
type changeSource struct {
	Client *http.Client
	// Base and Token are read per call so signing in or switching servers
	// applies on the next poll instead of after a restart.
	Base  func() string
	Token func() string
}

func (s changeSource) Version(ctx context.Context, since uint64) (uint64, error) {
	base := s.Base()
	if base == "" {
		return since, errNoServer
	}
	url := fmt.Sprintf("%s/v1/changes?since=%d&timeout_ms=%d", base, since, watchTimeoutMS)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return since, err
	}
	if token := s.Token(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := s.Client.Do(req)
	if err != nil {
		return since, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return since, fmt.Errorf("watch changes: %s", res.Status)
	}

	// grpc-gateway renders uint64 as a JSON string.
	var body struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return since, err
	}
	var version uint64
	if _, err := fmt.Sscanf(body.Version, "%d", &version); err != nil {
		return since, fmt.Errorf("watch changes: bad version %q", body.Version)
	}
	return version, nil
}

var errNoServer = errors.New("no dox server configured")

// watchChanges runs until ctx is cancelled. onChange fires once per observed
// version change; a timeout that returns the same version is not a change, so
// an idle session stays silent.
func watchChanges(ctx context.Context, enabled func() bool, source versionSource, onChange func()) {
	var since uint64
	backoff := watchRetryDelay

	for {
		if ctx.Err() != nil {
			return
		}
		if enabled != nil && !enabled() {
			if !sleep(ctx, watchRetryDelay) {
				return
			}
			continue
		}

		version, err := source.Version(ctx, since)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			// A flaky network must not turn into a hot loop: back off, capped
			// so a long outage still recovers quickly.
			slog.Debug("change watch failed", "err", err)
			if !sleep(ctx, backoff) {
				return
			}
			if backoff < watchMaxBackoff {
				backoff *= 2
			}
			continue
		}
		backoff = watchRetryDelay

		if version != since {
			since = version
			onChange()
		}
	}
}

// sleep reports false when ctx was cancelled during the wait.
func sleep(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

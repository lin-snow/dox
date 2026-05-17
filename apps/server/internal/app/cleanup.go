package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// eventSweepInterval is how often the retention sweep runs. The events table
// is small and the DELETE is cheap, so daily is plenty — picking a shorter
// cadence just burns wakeups for the same outcome.
const eventSweepInterval = 24 * time.Hour

// runEventRetention deletes events older than retention on a fixed cadence.
// Blocks until ctx is cancelled. A non-positive retention disables the sweep
// (the goroutine returns immediately).
//
// nowFn is injectable for tests; production passes time.Now.
func runEventRetention(ctx context.Context, q *queries.Queries, retention time.Duration, nowFn func() time.Time) {
	if retention <= 0 {
		slog.Info("event retention sweep disabled")
		return
	}
	// Sweep once on startup so a long-stopped server doesn't keep stale rows
	// around waiting for the first tick.
	sweepEvents(ctx, q, retention, nowFn)

	t := time.NewTicker(eventSweepInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			sweepEvents(ctx, q, retention, nowFn)
		}
	}
}

func sweepEvents(ctx context.Context, q *queries.Queries, retention time.Duration, nowFn func() time.Time) {
	cutoff := nowFn().Add(-retention).UnixMilli()
	n, err := q.DeleteEventsOlderThan(ctx, cutoff)
	if err != nil {
		// ctx cancellation during shutdown is expected, not worth logging at error.
		if ctx.Err() != nil {
			return
		}
		slog.Error("event retention sweep failed", "err", err, "cutoff_ms", cutoff)
		return
	}
	if n > 0 {
		slog.Info("event retention sweep", "deleted", n, "cutoff_ms", cutoff)
	}
}

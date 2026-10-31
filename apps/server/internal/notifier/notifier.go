// Package notifier turns due / remind instants into durable notifications.
//
// Why a ticker and not the bus: the bus is synchronous and tx-bound, so a
// subscriber failure rolls the caller's mutation back. A reminder is
// time-triggered and must never roll back a todo write — it runs in its own
// goroutine, exactly like the event-retention sweep in app/cleanup.go.
//
// Why no reminder rows to maintain: a notification is written only when it
// actually fires, and its identity is (user, todo, kind, trigger instant). An
// edited due/remind time is therefore a different identity — there is nothing
// to cancel, nothing to keep in sync, and re-running a tick (restart, overlap,
// second instance) is a no-op via ON CONFLICT DO NOTHING.
package notifier

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// KindDue is the only reminder kind today. More kinds ("due_soon",
// "overdue") are additive: the identity key already includes kind.
const KindDue = "due"

// Notification is one fired reminder, handed to deliverers after the row is
// safely committed.
type Notification struct {
	ID           string
	UserID       string
	TodoID       string
	TodoTitle    string
	ProjectID    sql.NullString
	Kind         string
	ScheduledFor int64
	CreatedAt    int64
}

// Deliverer is an out-of-band channel (webhook, ntfy, mail). The in-app
// channel needs no implementation: clients poll ListNotifications.
//
// A deliverer runs after the row is written; returning an error is logged and
// does not retract the notification, so the ledger stays the source of truth.
type Deliverer interface {
	Deliver(ctx context.Context, n Notification) error
}

// Config tunes the sweep. Zero values fall back to the defaults.
type Config struct {
	// Interval between ticks. <= 0 disables the sweep entirely; tests call
	// Tick directly instead of starting the loop.
	Interval time.Duration
	// Grace is how far back a tick looks for reminders it missed while the
	// server was down. Anything older is skipped rather than replayed.
	Grace time.Duration
	// Now is injectable for tests; nil means time.Now.
	Now func() time.Time
}

// defaultGrace applies when Config.Grace is unset. The interval has no
// default here: disabling the sweep must stay expressible, so config.Load owns
// the production default.
const defaultGrace = time.Hour

// Notifier is the reminder sweep. One instance per process; Tick is
// single-flight by construction because Run calls it from one goroutine.
type Notifier struct {
	q          *queries.Queries
	interval   time.Duration
	grace      time.Duration
	now        func() time.Time
	deliverers []Deliverer
	log        *slog.Logger
}

func New(q *queries.Queries, cfg Config, deliverers ...Deliverer) *Notifier {
	n := &Notifier{
		q:          q,
		interval:   cfg.Interval,
		grace:      cfg.Grace,
		now:        cfg.Now,
		deliverers: deliverers,
		log:        slog.Default(),
	}
	if n.grace <= 0 {
		n.grace = defaultGrace
	}
	if n.now == nil {
		n.now = time.Now
	}
	return n
}

// Run blocks until ctx is cancelled. A non-positive Interval disables the
// sweep, so a deployment can opt out (and tests never race a background ticker).
func (n *Notifier) Run(ctx context.Context) {
	if n.interval <= 0 {
		n.log.Info("reminder sweep disabled")
		return
	}
	n.handleTick(ctx)

	t := time.NewTicker(n.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n.handleTick(ctx)
		}
	}
}

func (n *Notifier) handleTick(ctx context.Context) {
	delivered, err := n.Tick(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		n.log.Error("reminder sweep failed", "err", err)
		return
	}
	if delivered > 0 {
		n.log.Info("reminder sweep", "delivered", delivered)
	}
}

// Tick runs one sweep and returns how many notifications were newly created.
// Safe to call concurrently with itself: duplicate inserts collapse.
//
// Window is (now-grace, now]. Reminders older than the grace period are
// intentionally dropped — a server that was down for a week should not replay
// a week of pings on startup.
func (n *Notifier) Tick(ctx context.Context) (int, error) {
	now := n.now().UTC()
	hi := now.UnixMilli()
	lo := now.Add(-n.grace).UnixMilli()

	triggers, err := n.q.ListDueTriggers(ctx, queries.ListDueTriggersParams{
		Lo: sql.NullInt64{Int64: lo, Valid: true},
		Hi: sql.NullInt64{Int64: hi, Valid: true},
	})
	if err != nil {
		return 0, err
	}

	created := 0
	for _, t := range triggers {
		if !t.TriggerAt.Valid {
			continue
		}
		recipients, err := n.q.ListTodoRecipients(ctx, t.ID)
		if err != nil {
			return created, err
		}
		for _, userID := range recipients {
			row := Notification{
				ID:           ulid.Make().String(),
				UserID:       userID,
				TodoID:       t.ID,
				TodoTitle:    t.Title,
				ProjectID:    t.ProjectID,
				Kind:         KindDue,
				ScheduledFor: t.TriggerAt.Int64,
				CreatedAt:    hi,
			}
			inserted, err := n.q.InsertNotification(ctx, queries.InsertNotificationParams{
				ID:           row.ID,
				UserID:       row.UserID,
				TodoID:       row.TodoID,
				TodoTitle:    row.TodoTitle,
				ProjectID:    row.ProjectID,
				Kind:         row.Kind,
				ScheduledFor: row.ScheduledFor,
				CreatedAt:    row.CreatedAt,
			})
			if err != nil {
				return created, err
			}
			if inserted == 0 {
				// Already delivered (restart, overlap, second instance).
				continue
			}
			created++
			n.deliver(ctx, row)
		}
	}
	return created, nil
}

func (n *Notifier) deliver(ctx context.Context, row Notification) {
	for _, d := range n.deliverers {
		if err := d.Deliver(ctx, row); err != nil {
			// The ledger row stands: an out-of-band channel failing must not
			// duplicate or reorder in-app delivery.
			n.log.Error("reminder delivery failed",
				"err", err, "notification", row.ID, "user", row.UserID)
		}
	}
}

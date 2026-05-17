// Package bus is an in-process synchronous pub/sub for cross-cutting reactions
// to domain mutations. Mutation handlers (todo, invite, project, …) publish
// typed Msg values; subscribers translate those into side effects (today: an
// activity-feed row; tomorrow potentially: webhooks, audit log, notifications).
//
// Why a bus at all (vs. handlers calling InsertEvent directly):
//   - New verbs land in one place — the recorder switch — instead of touching
//     every emit site
//   - New subscribers (audit, webhook) plug in without touching handler code
//   - Mutation handlers stay focused on the resource they own; cross-cutting
//     observers live in their own packages
//
// Why synchronous + tx-bound:
//   - Callers invoke Publish from inside runInTx with the tx-bound *queries.
//     Queries, so a subscriber failure rolls the primary mutation back. The
//     activity feed can never diverge from the underlying state.
//   - In-process means no broker, no serialization, no infra to operate.
//
// When to graduate to something fancier: more than one process needs to
// observe events (then it's a real broker), or a subscriber's work can/should
// run out-of-tx (then it's a deferred queue). Neither is true today.
package bus

import (
	"context"
	"database/sql"

	"github.com/oklog/ulid/v2"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// Msg is the marker interface for everything published through the bus.
// Implementations are concrete value types defined below; subscribers
// type-switch on them.
type Msg interface{ msg() }

// Subscriber consumes a Msg using the caller's tx-bound *queries.Queries.
// Returning a non-nil error aborts the publish and (via runInTx) rolls the
// surrounding transaction back.
type Subscriber interface {
	Handle(ctx context.Context, q *queries.Queries, m Msg) error
}

// Bus fans every Publish out to its Subscribers in registration order. Stops
// at the first error so a downstream failure doesn't get buried.
type Bus struct {
	subs []Subscriber
}

// New constructs a Bus with the given subscribers. Order is preserved.
func New(subs ...Subscriber) *Bus {
	return &Bus{subs: subs}
}

// Publish delivers m to every subscriber synchronously. Must be called from
// inside the caller's transaction (q comes from queries.WithTx) so a
// subscriber failure aborts the whole unit.
func (b *Bus) Publish(ctx context.Context, q *queries.Queries, m Msg) error {
	for _, s := range b.subs {
		if err := s.Handle(ctx, q, m); err != nil {
			return err
		}
	}
	return nil
}

// ── Message types ────────────────────────────────────────────────────────────
// Concrete payloads published by mutation handlers. Adding a new mutation is a
// matter of declaring a struct here + a msg() method + a recorder case below.

// TodoCreated fires after a todo row is inserted. ProjectID.Valid →
// project-scope (visible to project members); Invalid → personal/Inbox
// (visible only to the actor in the activity feed).
type TodoCreated struct {
	ActorID   string
	TodoID    string
	Title     string
	ProjectID sql.NullString
	At        int64
}

// TodoCompleted fires only on the false→true done transition. Re-marking an
// already-done todo or reopening (true→false) does not publish.
type TodoCompleted struct {
	ActorID   string
	TodoID    string
	Title     string
	ProjectID sql.NullString
	At        int64
}

// MemberJoined fires after AcceptInvite inserts the new project_members row.
// Always project-scope (server invites take a different code path).
type MemberJoined struct {
	ActorID     string
	ProjectID   string
	ProjectName string
	At          int64
}

func (TodoCreated) msg()   {}
func (TodoCompleted) msg() {}
func (MemberJoined) msg()  {}

// ── ActivityRecorder ────────────────────────────────────────────────────────
// Default subscriber: persists every known Msg as a row in the events table
// so the TUI's Activity panel can render it. Unknown Msg types are silently
// ignored, which is deliberate — it means adding a new Msg type doesn't
// require touching the recorder unless you actually want it in the feed.

// Snapshot cap for target_label. Long todo titles still render in the feed,
// just truncated; the original row is unchanged.
const maxEventTargetLabelLen = 200

const (
	verbTodoCreated   = "todo_created"
	verbTodoCompleted = "todo_completed"
	verbMemberJoined  = "member_joined"

	targetTypeTodo    = "todo"
	targetTypeProject = "project"
)

type ActivityRecorder struct{}

func NewActivityRecorder() *ActivityRecorder { return &ActivityRecorder{} }

func (r *ActivityRecorder) Handle(ctx context.Context, q *queries.Queries, m Msg) error {
	switch e := m.(type) {
	case TodoCreated:
		return insertEvent(ctx, q, verbTodoCreated, e.ActorID, e.ProjectID, targetTypeTodo, e.TodoID, e.Title, e.At)
	case TodoCompleted:
		return insertEvent(ctx, q, verbTodoCompleted, e.ActorID, e.ProjectID, targetTypeTodo, e.TodoID, e.Title, e.At)
	case MemberJoined:
		return insertEvent(ctx, q, verbMemberJoined, e.ActorID,
			sql.NullString{String: e.ProjectID, Valid: true},
			targetTypeProject, e.ProjectID, e.ProjectName, e.At)
	}
	return nil
}

func insertEvent(ctx context.Context, q *queries.Queries, verb, actorID string, projectID sql.NullString, targetType, targetID, label string, at int64) error {
	if len(label) > maxEventTargetLabelLen {
		label = label[:maxEventTargetLabelLen]
	}
	return q.InsertEvent(ctx, queries.InsertEventParams{
		ID:          ulid.Make().String(),
		Verb:        verb,
		ActorID:     actorID,
		ProjectID:   projectID,
		TargetType:  targetType,
		TargetID:    targetID,
		TargetLabel: label,
		CreatedAt:   at,
	})
}

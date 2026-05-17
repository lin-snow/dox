package handler

import (
	"context"
	"database/sql"

	"github.com/oklog/ulid/v2"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// Activity-feed verbs. Keep in sync with proto Event.verb documentation and
// with the TUI's ActivityFeed render switch.
const (
	verbTodoCreated   = "todo_created"
	verbTodoCompleted = "todo_completed"
	verbMemberJoined  = "member_joined"

	targetTypeTodo    = "todo"
	targetTypeProject = "project"

	// Snapshot cap for target_label. Long todo titles still render in the feed,
	// just truncated; the original is unchanged on the underlying row.
	maxEventTargetLabelLen = 200
)

// runInTx wraps fn in a sql transaction and runs it against a tx-bound copy of
// the queries. Mutations that also emit activity events use this so the
// primary write and the InsertEvent share a single atomic commit — a failed
// event write rolls the mutation back instead of silently desyncing the feed.
func runInTx(ctx context.Context, db *sql.DB, q *queries.Queries, fn func(*queries.Queries) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(q.WithTx(tx)); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// eventEmission captures the per-call shape of an activity event. The helper
// fills in id (ULID) and label truncation so call sites stay short.
type eventEmission struct {
	Verb        string
	ActorID     string
	ProjectID   string
	TargetType  string
	TargetID    string
	TargetLabel string
	At          int64
}

func emitEvent(ctx context.Context, q *queries.Queries, e eventEmission) error {
	label := e.TargetLabel
	if len(label) > maxEventTargetLabelLen {
		label = label[:maxEventTargetLabelLen]
	}
	return q.InsertEvent(ctx, queries.InsertEventParams{
		ID:          ulid.Make().String(),
		Verb:        e.Verb,
		ActorID:     e.ActorID,
		ProjectID:   e.ProjectID,
		TargetType:  e.TargetType,
		TargetID:    e.TargetID,
		TargetLabel: label,
		CreatedAt:   e.At,
	})
}

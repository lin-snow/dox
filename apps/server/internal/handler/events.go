package handler

import (
	"context"
	"database/sql"

	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// runInTx wraps fn in a sql transaction and runs it against a tx-bound copy
// of the queries. Mutation handlers use this when the primary write needs to
// commit atomically with side effects published through bus.Bus — a
// subscriber failure rolls the mutation back instead of silently desyncing
// downstream state (activity feed, future webhooks, …).
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

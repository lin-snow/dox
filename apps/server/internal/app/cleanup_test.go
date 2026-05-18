package app

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

func TestSweepEvents_deletesOlderThanRetention(t *testing.T) {
	q, _ := openTestDB(t)
	const userID = "u1"
	if _, err := q.CreateUser(context.Background(), queries.CreateUserParams{
		ID:           userID,
		Name:         "alice",
		PasswordHash: "x",
		Role:         "owner",
		CreatedAt:    0,
	}); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	now := time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC)
	retention := 15 * 24 * time.Hour
	cutoff := now.Add(-retention).UnixMilli()

	// Three events: one well before cutoff (delete), one just at cutoff
	// (boundary keep — DELETE is strict <), one fresh (keep).
	seedEvent(t, q, "old", userID, cutoff-1)
	seedEvent(t, q, "edge", userID, cutoff)
	seedEvent(t, q, "fresh", userID, now.UnixMilli())

	sweepEvents(context.Background(), q, retention, func() time.Time { return now })

	gotIDs := listEventIDs(t, q)
	if len(gotIDs) != 2 {
		t.Fatalf("want 2 events after sweep, got %d: %v", len(gotIDs), gotIDs)
	}
	for _, id := range gotIDs {
		if id == "old" {
			t.Errorf("old event was not deleted: %v", gotIDs)
		}
	}
}

func TestRunEventRetention_disabledWhenRetentionNonPositive(t *testing.T) {
	q, _ := openTestDB(t)
	const userID = "u1"
	if _, err := q.CreateUser(context.Background(), queries.CreateUserParams{
		ID: userID, Name: "alice", PasswordHash: "x", Role: "owner", CreatedAt: 0,
	}); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	seedEvent(t, q, "ancient", userID, 0)

	// Retention=0 means no sweeping. The function should return immediately
	// without ever calling DELETE.
	runEventRetention(context.Background(), q, 0, time.Now)

	if got := listEventIDs(t, q); len(got) != 1 {
		t.Fatalf("want 1 event preserved when disabled, got %d: %v", len(got), got)
	}
}

func openTestDB(t *testing.T) (*queries.Queries, *sql.DB) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "cleanup.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return queries.New(conn), conn
}

func seedEvent(t *testing.T, q *queries.Queries, id, actorID string, createdAt int64) {
	t.Helper()
	if err := q.InsertEvent(context.Background(), queries.InsertEventParams{
		ID:          id,
		Verb:        "todo_created",
		ActorID:     actorID,
		TargetType:  "todo",
		TargetID:    "t",
		TargetLabel: "x",
		CreatedAt:   createdAt,
	}); err != nil {
		t.Fatalf("InsertEvent: %v", err)
	}
}

func listEventIDs(t *testing.T, q *queries.Queries) []string {
	t.Helper()
	// Use the personal-scope reader; with no project_id all seeded rows show up
	// for the actor.
	rows, err := q.ListPersonalEventsForUser(context.Background(), queries.ListPersonalEventsForUserParams{
		UserID: "u1",
		LimitN: 100,
	})
	if err != nil {
		t.Fatalf("ListPersonalEventsForUser: %v", err)
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return ids
}

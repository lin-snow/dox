package notifier

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

var testNow = time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC)

type deliveryRecorder struct {
	mu   sync.Mutex
	seen []Notification
}

func (d *deliveryRecorder) Deliver(_ context.Context, n Notification) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.seen = append(d.seen, n)
	return nil
}

func (d *deliveryRecorder) count() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.seen)
}

func TestTick_firesOncePerRecipient(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	seedTodo(t, q, todoSeed{id: "t1", title: "ship it", createdBy: "u1", dueAt: testNow.UnixMilli()})

	n := newNotifier(q)
	if got, err := n.Tick(context.Background()); err != nil || got != 1 {
		t.Fatalf("first tick = %d, %v; want 1, nil", got, err)
	}
	if got, err := n.Tick(context.Background()); err != nil || got != 0 {
		t.Fatalf("second tick = %d, %v; want 0 (idempotent), nil", got, err)
	}

	rows := listRows(t, q, "u1")
	if len(rows) != 1 {
		t.Fatalf("want 1 notification, got %d", len(rows))
	}
	if rows[0].ScheduledFor != testNow.UnixMilli() {
		t.Fatalf("scheduled_for = %d; want %d", rows[0].ScheduledFor, testNow.UnixMilli())
	}
	if rows[0].TodoTitle != "ship it" || rows[0].Kind != KindDue {
		t.Fatalf("unexpected row: %+v", rows[0])
	}
	if rows[0].ReadAt.Valid {
		t.Fatalf("fresh notification is already read")
	}
}

func TestTick_graceWindowBoundsCatchUp(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	grace := time.Hour
	seedTodo(t, q, todoSeed{id: "old", title: "stale", createdBy: "u1", dueAt: testNow.Add(-2 * grace).UnixMilli()})
	seedTodo(t, q, todoSeed{id: "edge", title: "edge", createdBy: "u1", dueAt: testNow.Add(-grace).UnixMilli()})
	seedTodo(t, q, todoSeed{id: "fresh", title: "fresh", createdBy: "u1", dueAt: testNow.Add(-grace + time.Second).UnixMilli()})
	seedTodo(t, q, todoSeed{id: "future", title: "future", createdBy: "u1", dueAt: testNow.Add(time.Second).UnixMilli()})

	n := newNotifier(q)
	got, err := n.Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick: %v", err)
	}
	if got != 1 {
		t.Fatalf("delivered %d; want 1 (only the trigger inside (now-grace, now])", got)
	}
	rows := listRows(t, q, "u1")
	if len(rows) != 1 || rows[0].TodoID != "fresh" {
		t.Fatalf("delivered rows = %+v; want only todo fresh", rows)
	}
}

func TestTick_allDayNeedsExplicitReminder(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	// Local midnight of the due date would fire at 00:00 UTC if the sweep were
	// naive; the guard must keep it silent.
	seedTodo(t, q, todoSeed{id: "allday", title: "calendar", createdBy: "u1", dueAt: testNow.UnixMilli(), allDay: true})

	if got, _ := newNotifier(q).Tick(context.Background()); got != 0 {
		t.Fatalf("all-day todo without remind_at delivered %d; want 0", got)
	}

	remind := testNow.Add(-time.Minute).UnixMilli()
	if _, err := q.UpdateTodoRemind(context.Background(), queries.UpdateTodoRemindParams{
		RemindAt:  sql.NullInt64{Int64: remind, Valid: true},
		UpdatedAt: testNow.UnixMilli(),
		ID:        "allday",
	}); err != nil {
		t.Fatalf("UpdateTodoRemind: %v", err)
	}

	got, err := newNotifier(q).Tick(context.Background())
	if err != nil || got != 1 {
		t.Fatalf("with remind_at: %d, %v; want 1, nil", got, err)
	}
	rows := listRows(t, q, "u1")
	if len(rows) != 1 || rows[0].ScheduledFor != remind {
		t.Fatalf("rows = %+v; want one row scheduled at remind_at %d", rows, remind)
	}
}

func TestTick_remindOverridesDue(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	remind := testNow.Add(-time.Minute).UnixMilli()
	seedTodo(t, q, todoSeed{
		id:        "t1",
		title:     "later",
		createdBy: "u1",
		dueAt:     testNow.Add(48 * time.Hour).UnixMilli(),
		remindAt:  remind,
	})

	if got, err := newNotifier(q).Tick(context.Background()); err != nil || got != 1 {
		t.Fatalf("tick = %d, %v; want 1, nil", got, err)
	}
	rows := listRows(t, q, "u1")
	if len(rows) != 1 || rows[0].ScheduledFor != remind {
		t.Fatalf("rows = %+v; want one row at the remind instant", rows)
	}
}

func TestTick_fansOutToProjectOwnerAndMembers(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "owner")
	seedUser(t, q, "m1")
	seedUser(t, q, "m2")
	if _, err := q.CreateProject(context.Background(), queries.CreateProjectParams{
		ID: "p1", OwnerID: "owner", Name: "proj", CreatedAt: testNow.UnixMilli(), UpdatedAt: testNow.UnixMilli(),
	}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	// Every recipient is also a member row, and the owner is *both* owner and
	// member: DISTINCT must collapse the duplicates.
	for _, uid := range []string{"owner", "m1", "m2"} {
		if err := q.AddProjectMember(context.Background(), queries.AddProjectMemberParams{
			ProjectID: "p1", UserID: uid, Role: "editor", AddedAt: testNow.UnixMilli(),
		}); err != nil {
			t.Fatalf("AddProjectMember: %v", err)
		}
	}
	seedTodo(t, q, todoSeed{id: "t1", title: "shared", createdBy: "m2", projectID: "p1", dueAt: testNow.UnixMilli()})

	got, err := newNotifier(q).Tick(context.Background())
	if err != nil || got != 3 {
		t.Fatalf("tick = %d, %v; want 3 (owner + m1 + m2)", got, err)
	}
	for _, uid := range []string{"owner", "m1", "m2"} {
		if rows := listRows(t, q, uid); len(rows) != 1 {
			t.Fatalf("%s has %d notifications; want 1", uid, len(rows))
		}
	}
}

func TestTick_completedTodosAreSkipped(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	seedTodo(t, q, todoSeed{id: "t1", title: "done already", createdBy: "u1", dueAt: testNow.UnixMilli(), done: true})

	if got, err := newNotifier(q).Tick(context.Background()); err != nil || got != 0 {
		t.Fatalf("tick = %d, %v; want 0, nil", got, err)
	}
}

func TestTick_deliversOnlyFreshRows(t *testing.T) {
	q := openDB(t)
	seedUser(t, q, "u1")
	seedTodo(t, q, todoSeed{id: "t1", title: "ping", createdBy: "u1", dueAt: testNow.UnixMilli()})

	deliveries := &deliveryRecorder{}
	n := newNotifier(q, deliveries)
	if _, err := n.Tick(context.Background()); err != nil {
		t.Fatalf("Tick: %v", err)
	}
	if _, err := n.Tick(context.Background()); err != nil {
		t.Fatalf("Tick: %v", err)
	}
	if got := deliveries.count(); got != 1 {
		t.Fatalf("deliveries = %d; want 1 (a conflict is not a delivery)", got)
	}
	if got := deliveries.seen[0].TodoID; got != "t1" {
		t.Fatalf("delivered todo = %q; want t1", got)
	}
}

func newNotifier(q *queries.Queries, deliverers ...Deliverer) *Notifier {
	return New(q, Config{
		Grace: time.Hour,
		Now:   func() time.Time { return testNow },
	}, deliverers...)
}

func openDB(t *testing.T) *queries.Queries {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "notifier.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return queries.New(conn)
}

func seedUser(t *testing.T, q *queries.Queries, id string) {
	t.Helper()
	if _, err := q.CreateUser(context.Background(), queries.CreateUserParams{
		ID:           id,
		Name:         "user-" + id,
		PasswordHash: "x",
		Role:         "member",
		CreatedAt:    testNow.UnixMilli(),
	}); err != nil {
		t.Fatalf("CreateUser(%s): %v", id, err)
	}
}

type todoSeed struct {
	id        string
	title     string
	createdBy string
	projectID string
	dueAt     int64
	remindAt  int64
	allDay    bool
	done      bool
}

func seedTodo(t *testing.T, q *queries.Queries, s todoSeed) {
	t.Helper()
	if _, err := q.CreateTodo(context.Background(), queries.CreateTodoParams{
		ID:        s.id,
		Title:     s.title,
		DueAt:     nullable(s.dueAt),
		DueAllDay: s.allDay,
		RemindAt:  nullable(s.remindAt),
		ProjectID: nullableString(s.projectID),
		CreatedBy: s.createdBy,
		CreatedAt: testNow.UnixMilli(),
		UpdatedAt: testNow.UnixMilli(),
	}); err != nil {
		t.Fatalf("CreateTodo(%s): %v", s.id, err)
	}
	if s.done {
		if _, err := q.UpdateTodoDone(context.Background(), queries.UpdateTodoDoneParams{
			Done: true, UpdatedAt: testNow.UnixMilli(), ID: s.id,
		}); err != nil {
			t.Fatalf("UpdateTodoDone(%s): %v", s.id, err)
		}
	}
}

func listRows(t *testing.T, q *queries.Queries, userID string) []queries.Notification {
	t.Helper()
	rows, err := q.ListNotificationsForUser(context.Background(), queries.ListNotificationsForUserParams{
		UserID: userID,
		LimitN: 100,
	})
	if err != nil {
		t.Fatalf("ListNotificationsForUser(%s): %v", userID, err)
	}
	return rows
}

func nullable(ms int64) sql.NullInt64 {
	if ms == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: ms, Valid: true}
}

func nullableString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

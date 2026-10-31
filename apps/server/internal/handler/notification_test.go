package handler_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
	_ "github.com/mattn/go-sqlite3"
	"github.com/oklog/ulid/v2"
)

func TestListNotifications_scopedToCaller(t *testing.T) {
	s, q, ctx, alice, bob := newNotificationFixture(t)
	t1 := seedNotifiableTodo(t, q, alice.ID)
	t2 := seedNotifiableTodo(t, q, alice.ID)
	t3 := seedNotifiableTodo(t, q, bob.ID)
	seedNotification(t, q, alice.ID, t1, "alice todo", nil, 1000)
	seedNotification(t, q, alice.ID, t2, "read todo", new(int64(1500)), 2000)
	seedNotification(t, q, bob.ID, t3, "bob todo", nil, 3000)

	all, err := s.ListNotifications(ctx, &doxv1.ListNotificationsRequest{})
	if err != nil {
		t.Fatalf("ListNotifications: %v", err)
	}
	if len(all.Notifications) != 2 {
		t.Fatalf("got %d rows; want only alice's 2", len(all.Notifications))
	}
	if all.UnreadCount != 1 {
		t.Fatalf("unread_count = %d; want 1", all.UnreadCount)
	}
	// Newest trigger first.
	if all.Notifications[0].TodoId != t2 {
		t.Fatalf("order wrong: first = %q; want %q", all.Notifications[0].TodoId, t2)
	}

	unread, err := s.ListNotifications(ctx, &doxv1.ListNotificationsRequest{UnreadOnly: true})
	if err != nil {
		t.Fatalf("ListNotifications(unread): %v", err)
	}
	if len(unread.Notifications) != 1 || unread.Notifications[0].TodoId != t1 {
		t.Fatalf("unread list = %+v", unread.Notifications)
	}
	if unread.UnreadCount != 1 {
		t.Fatalf("unread_count with filter = %d; want 1", unread.UnreadCount)
	}
}

func TestAckNotifications_ignoresForeignAndAcksAllWhenEmpty(t *testing.T) {
	s, q, ctx, alice, bob := newNotificationFixture(t)
	aliceTodo := seedNotifiableTodo(t, q, alice.ID)
	bobTodo := seedNotifiableTodo(t, q, bob.ID)
	aliceRow := seedNotification(t, q, alice.ID, aliceTodo, "mine", nil, 1000)
	bobRow := seedNotification(t, q, bob.ID, bobTodo, "not mine", nil, 2000)

	acked, err := s.AckNotifications(ctx, &doxv1.AckNotificationsRequest{Ids: []string{bobRow}})
	if err != nil {
		t.Fatalf("AckNotifications(foreign): %v", err)
	}
	if acked.Acked != 0 {
		t.Fatalf("acked %d foreign rows; want 0", acked.Acked)
	}

	acked, err = s.AckNotifications(ctx, &doxv1.AckNotificationsRequest{Ids: []string{aliceRow, "does-not-exist"}})
	if err != nil {
		t.Fatalf("AckNotifications: %v", err)
	}
	if acked.Acked != 1 {
		t.Fatalf("acked = %d; want 1", acked.Acked)
	}
	if n, _ := q.CountUnreadNotifications(context.Background(), alice.ID); n != 0 {
		t.Fatalf("alice unread after ack = %d; want 0", n)
	}
	if n, _ := q.CountUnreadNotifications(context.Background(), bob.ID); n != 1 {
		t.Fatalf("bob unread = %d; want untouched 1", n)
	}

	// Empty ids = ack everything unread, idempotently.
	if acked, err = s.AckNotifications(ctx, &doxv1.AckNotificationsRequest{}); err != nil {
		t.Fatalf("AckNotifications(all): %v", err)
	} else if acked.Acked != 0 {
		t.Fatalf("second empty ack = %d; want 0", acked.Acked)
	}
}

func newNotificationFixture(t *testing.T) (*handler.Notification, *queries.Queries, context.Context, queries.User, queries.User) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "notif.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	q := queries.New(conn)
	alice := seedUser(t, q, "alice", caller.RoleOwner)
	bob := seedUser(t, q, "bob", caller.RoleMember)
	ctx := caller.With(context.Background(), caller.Caller{
		UserID: alice.ID, UserName: alice.Name, Role: alice.Role,
	})
	return handler.NewNotification(q), q, ctx, alice, bob
}

func seedNotifiableTodo(t *testing.T, q *queries.Queries, userID string) string {
	t.Helper()
	id := ulid.Make().String()
	if _, err := q.CreateTodo(context.Background(), queries.CreateTodoParams{
		ID:        id,
		Title:     "todo",
		CreatedBy: userID,
		CreatedAt: 1,
		UpdatedAt: 1,
	}); err != nil {
		t.Fatalf("CreateTodo: %v", err)
	}
	return id
}

func seedNotification(t *testing.T, q *queries.Queries, userID, todoID, title string, readAt *int64, scheduledFor int64) string {
	t.Helper()
	id := ulid.Make().String()
	var read sql.NullInt64
	if readAt != nil {
		read = sql.NullInt64{Int64: *readAt, Valid: true}
	}
	if _, err := q.InsertNotification(context.Background(), queries.InsertNotificationParams{
		ID:           id,
		UserID:       userID,
		TodoID:       todoID,
		Kind:         "due",
		ScheduledFor: scheduledFor,
		TodoTitle:    title,
		CreatedAt:    scheduledFor,
	}); err != nil {
		t.Fatalf("InsertNotification: %v", err)
	}
	if read.Valid {
		if _, err := q.AckNotifications(context.Background(), queries.AckNotificationsParams{
			ReadAt: read, UserID: userID, Ids: []string{id},
		}); err != nil {
			t.Fatalf("AckNotifications: %v", err)
		}
	}
	return id
}

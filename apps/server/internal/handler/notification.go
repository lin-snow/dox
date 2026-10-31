package handler

import (
	"context"
	"database/sql"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	defaultNotificationsLimit = 20
	maxNotificationsLimit     = 100
)

// Notification implements NotificationService: a read/ack view over the ledger
// the reminder sweep (internal/notifier) writes. Nothing here creates rows —
// clients cannot fabricate reminders for themselves or anyone else.
type Notification struct {
	doxv1.UnimplementedNotificationServiceServer
	q   *queries.Queries
	now func() int64
}

func NewNotification(q *queries.Queries) *Notification {
	return &Notification{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Notification) ListNotifications(ctx context.Context, req *doxv1.ListNotificationsRequest) (*doxv1.ListNotificationsResponse, error) {
	c := caller.MustFrom(ctx)
	limit := int64(req.GetLimit())
	if limit <= 0 {
		limit = defaultNotificationsLimit
	}
	if limit > maxNotificationsLimit {
		limit = maxNotificationsLimit
	}

	var (
		rows []queries.Notification
		err  error
	)
	if req.GetUnreadOnly() {
		rows, err = s.q.ListUnreadNotificationsForUser(ctx, queries.ListUnreadNotificationsForUserParams{
			UserID: c.UserID,
			LimitN: limit,
		})
	} else {
		rows, err = s.q.ListNotificationsForUser(ctx, queries.ListNotificationsForUserParams{
			UserID: c.UserID,
			LimitN: limit,
		})
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list notifications: %v", err)
	}

	unread, err := s.q.CountUnreadNotifications(ctx, c.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "count unread notifications: %v", err)
	}

	out := make([]*doxv1.Notification, 0, len(rows))
	for _, r := range rows {
		out = append(out, notificationToProto(r))
	}
	return &doxv1.ListNotificationsResponse{
		Notifications: out,
		UnreadCount:   uint32(unread),
	}, nil
}

// AckNotifications marks rows read. Ids the caller doesn't own are silently
// skipped by the user_id predicate, which keeps the call idempotent and avoids
// leaking whether an id exists.
func (s *Notification) AckNotifications(ctx context.Context, req *doxv1.AckNotificationsRequest) (*doxv1.AckNotificationsResponse, error) {
	c := caller.MustFrom(ctx)
	readAt := sql.NullInt64{Int64: s.now(), Valid: true}

	var (
		acked int64
		err   error
	)
	if len(req.GetIds()) == 0 {
		acked, err = s.q.AckAllNotifications(ctx, queries.AckAllNotificationsParams{
			ReadAt: readAt,
			UserID: c.UserID,
		})
	} else {
		acked, err = s.q.AckNotifications(ctx, queries.AckNotificationsParams{
			ReadAt: readAt,
			UserID: c.UserID,
			Ids:    req.GetIds(),
		})
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "ack notifications: %v", err)
	}
	return &doxv1.AckNotificationsResponse{Acked: uint32(acked)}, nil
}

func notificationToProto(n queries.Notification) *doxv1.Notification {
	out := &doxv1.Notification{
		Id:           n.ID,
		TodoId:       n.TodoID,
		TodoTitle:    n.TodoTitle,
		Kind:         n.Kind,
		ScheduledFor: n.ScheduledFor,
		CreatedAt:    n.CreatedAt,
	}
	if n.ProjectID.Valid {
		v := n.ProjectID.String
		out.ProjectId = &v
	}
	if n.ReadAt.Valid {
		v := n.ReadAt.Int64
		out.ReadAt = &v
	}
	return out
}

package handler

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	defaultEventsLimit = 20
	maxEventsLimit     = 50
)

// Event implements EventService. Read-only: the feed is appended by mutation
// handlers (Todo, Invite) inside their own transactions; this handler only
// fans the rows back out filtered by the caller's project visibility.
type Event struct {
	doxv1.UnimplementedEventServiceServer
	q *queries.Queries
}

func NewEvent(q *queries.Queries) *Event {
	return &Event{q: q}
}

func (s *Event) ListEvents(ctx context.Context, req *doxv1.ListEventsRequest) (*doxv1.ListEventsResponse, error) {
	c := caller.MustFrom(ctx)
	limit := int64(req.GetLimit())
	if limit <= 0 {
		limit = defaultEventsLimit
	}
	if limit > maxEventsLimit {
		limit = maxEventsLimit
	}
	rows, err := s.q.ListEventsForUser(ctx, queries.ListEventsForUserParams{
		UserID: c.UserID,
		LimitN: limit,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list events: %v", err)
	}
	events := make([]*doxv1.Event, 0, len(rows))
	for _, r := range rows {
		events = append(events, &doxv1.Event{
			Id:           r.ID,
			Verb:         r.Verb,
			ActorId:      r.ActorID,
			ActorName:    r.ActorName,
			ProjectId:    r.ProjectID,
			ProjectName:  r.ProjectName,
			ProjectColor: r.ProjectColor.String,
			TargetType:   r.TargetType,
			TargetId:     r.TargetID,
			TargetLabel:  r.TargetLabel,
			CreatedAt:    r.CreatedAt,
		})
	}
	return &doxv1.ListEventsResponse{Events: events}, nil
}

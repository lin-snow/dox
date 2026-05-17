package handler

import (
	"context"
	"sort"

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
// fans the rows back out filtered by the caller's project visibility (for
// project events) or actor identity (for personal events).
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

	// Two scopes, two queries — split because sqlc's SQLite parser can't
	// express both in one statement. We over-fetch each side at the full
	// limit so the merge can pick the freshest `limit` items overall (worst
	// case: the user's recent activity is all from one scope).
	projectRows, err := s.q.ListProjectEventsForUser(ctx, queries.ListProjectEventsForUserParams{
		UserID: c.UserID,
		LimitN: limit,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list project events: %v", err)
	}
	personalRows, err := s.q.ListPersonalEventsForUser(ctx, queries.ListPersonalEventsForUserParams{
		UserID: c.UserID,
		LimitN: limit,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list personal events: %v", err)
	}

	merged := make([]*doxv1.Event, 0, len(projectRows)+len(personalRows))
	for _, r := range projectRows {
		merged = append(merged, &doxv1.Event{
			Id:           r.ID,
			Verb:         r.Verb,
			ActorId:      r.ActorID,
			ActorName:    r.ActorName,
			ProjectId:    r.ProjectID.String,
			ProjectName:  r.ProjectName,
			ProjectColor: r.ProjectColor.String,
			TargetType:   r.TargetType,
			TargetId:     r.TargetID,
			TargetLabel:  r.TargetLabel,
			CreatedAt:    r.CreatedAt,
		})
	}
	for _, r := range personalRows {
		merged = append(merged, &doxv1.Event{
			Id:          r.ID,
			Verb:        r.Verb,
			ActorId:     r.ActorID,
			ActorName:   r.ActorName,
			TargetType:  r.TargetType,
			TargetId:    r.TargetID,
			TargetLabel: r.TargetLabel,
			CreatedAt:   r.CreatedAt,
			// project_id/name/color intentionally left empty — TUI uses
			// empty projectColor as the signal to suppress the swatch.
		})
	}

	// Merge sort: newest first, ULID as ms-collision tiebreaker (matches the
	// ORDER BY inside each query so the merged feed reads consistently).
	sort.SliceStable(merged, func(i, j int) bool {
		if merged[i].CreatedAt != merged[j].CreatedAt {
			return merged[i].CreatedAt > merged[j].CreatedAt
		}
		return merged[i].Id > merged[j].Id
	})
	if int64(len(merged)) > limit {
		merged = merged[:limit]
	}
	return &doxv1.ListEventsResponse{Events: merged}, nil
}

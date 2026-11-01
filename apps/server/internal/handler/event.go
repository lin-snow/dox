package handler

import (
	"context"
	"sort"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	defaultEventsLimit = 20
	maxEventsLimit     = 50

	// Long-poll budget. 25s survives the usual 30–60s proxy idle timeout while
	// keeping an idle desktop at roughly one request every half minute.
	defaultWatchTimeout = 25 * time.Second
	minWatchTimeout     = 100 * time.Millisecond
	maxWatchTimeout     = 60 * time.Second
)

// Event implements EventService. Read-only: the feed is appended by mutation
// handlers (Todo, Invite) inside their own transactions; this handler only
// fans the rows back out filtered by the caller's project visibility (for
// project events) or actor identity (for personal events).
type Event struct {
	doxv1.UnimplementedEventServiceServer
	q       *queries.Queries
	changes *Changes
}

func NewEvent(q *queries.Queries, changes *Changes) *Event {
	return &Event{q: q, changes: changes}
}

// WatchChanges long-polls the mutation counter. The timeout is clamped: too
// short makes clients chatty, too long trips proxy and phone idle timeouts.
func (s *Event) WatchChanges(ctx context.Context, req *doxv1.WatchChangesRequest) (*doxv1.WatchChangesResponse, error) {
	timeout := time.Duration(req.GetTimeoutMs()) * time.Millisecond
	switch {
	case req.GetTimeoutMs() == 0:
		timeout = defaultWatchTimeout
	case timeout < minWatchTimeout:
		timeout = minWatchTimeout
	case timeout > maxWatchTimeout:
		timeout = maxWatchTimeout
	}

	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return &doxv1.WatchChangesResponse{
		Version: s.changes.Wait(waitCtx, req.GetSince()),
	}, nil
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
		})
	}

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

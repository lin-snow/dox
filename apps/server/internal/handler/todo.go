package handler

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/bus"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const (
	maxTitleLen       = 1024
	maxDescriptionLen = 64 * 1024
	ulidLen           = 26

	// Sanity ceiling for due_at / remind_at: a typo like "2062" or a stray
	// microsecond value should fail loudly instead of scheduling a reminder for
	// the year 52000.
	maxScheduleHorizonMs = 100 * 365 * 24 * 60 * 60 * 1000

	projectInbox = "inbox"
)

// Todo implements TodoService.
//
// Visibility rules:
//   - Inbox todo (project_id NULL) is visible only to its created_by.
//   - Project todo is visible to project owner + members.
//   - Mutations require owner or editor; viewers are read-only.
//
// Holds the *sql.DB alongside *queries.Queries so mutations that publish
// bus messages (CreateTodo, UpdateTodo flipping done) can wrap the write
// and the bus.Publish in a single transaction via runInTx.
type Todo struct {
	doxv1.UnimplementedTodoServiceServer
	db  *sql.DB
	q   *queries.Queries
	bus *bus.Bus
	now func() int64
}

func NewTodo(db *sql.DB, q *queries.Queries, b *bus.Bus) *Todo {
	return &Todo{
		db:  db,
		q:   q,
		bus: b,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Todo) ListTodos(ctx context.Context, req *doxv1.ListTodosRequest) (*doxv1.ListTodosResponse, error) {
	c := caller.MustFrom(ctx)
	var rows []todoView
	switch {
	case req.ProjectId == nil:
		r, err := s.q.ListTodosForUser(ctx, c.UserID)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list todos: %v", err)
		}
		rows = make([]todoView, 0, len(r))
		for _, row := range r {
			rows = append(rows, todoView(row))
		}
	case *req.ProjectId == projectInbox:
		r, err := s.q.ListInboxTodos(ctx, c.UserID)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list inbox: %v", err)
		}
		rows = make([]todoView, 0, len(r))
		for _, row := range r {
			rows = append(rows, todoView(row))
		}
	default:
		if err := authz.CanReadProject(ctx, s.q, c.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		r, err := s.q.ListTodosInProject(ctx, sql.NullString{String: *req.ProjectId, Valid: true})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "list project todos: %v", err)
		}
		rows = make([]todoView, 0, len(r))
		for _, row := range r {
			rows = append(rows, todoView(row))
		}
	}
	todos := make([]*doxv1.Todo, 0, len(rows))
	for _, r := range rows {
		todos = append(todos, r.toProto(req.GetIncludeDescription()))
	}
	return &doxv1.ListTodosResponse{Todos: todos}, nil
}

func (s *Todo) GetTodo(ctx context.Context, req *doxv1.GetTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}
	row, err := s.q.GetTodo(ctx, id)
	if err != nil {
		return nil, translateGetTodoErr(err, id)
	}
	view := todoView(row)
	if err := s.assertVisible(ctx, c.UserID, view); err != nil {
		return nil, err
	}
	return view.toProto(true), nil
}

func (s *Todo) CreateTodo(ctx context.Context, req *doxv1.CreateTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	title := strings.TrimSpace(req.GetTitle())
	if title == "" {
		return nil, status.Error(codes.InvalidArgument, "title is required")
	}
	if len(title) > maxTitleLen {
		return nil, status.Errorf(codes.InvalidArgument, "title exceeds %d bytes", maxTitleLen)
	}

	description, err := normalizeDescription(req.Description)
	if err != nil {
		return nil, err
	}

	now := s.now()
	due, err := normalizeDue(dueValues{}, req.DueAt, req.DueAllDay, req.DueZone, now)
	if err != nil {
		return nil, err
	}
	if due == nil {
		due = &dueValues{}
	}
	remind, err := normalizeRemindAt(req.RemindAt, now)
	if err != nil {
		return nil, err
	}
	meeting, err := normalizeMeeting(meetingValues{}, req.StartsAt, req.EndsAt, now)
	if err != nil {
		return nil, err
	}
	if meeting == nil {
		meeting = &meetingValues{}
	}

	var projectID sql.NullString
	if req.ProjectId != nil && *req.ProjectId != "" {
		if err := authz.CanWriteProjectTodos(ctx, s.q, c.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		projectID = sql.NullString{String: *req.ProjectId, Valid: true}
	}

	id := ulid.Make().String()
	var row queries.CreateTodoRow
	err = runInTx(ctx, s.db, s.q, func(q *queries.Queries) error {
		// "Top of the list" is a stored fact now, not a sorting accident: the
		// new row takes the scope's highest position so it appears first even
		// after someone has dragged the list into their own order.
		position, err := q.NextTodoPosition(ctx, queries.NextTodoPositionParams{
			ProjectID: projectID.String,
			UserID:    c.UserID,
		})
		if err != nil {
			return err
		}
		row, err = q.CreateTodo(ctx, queries.CreateTodoParams{
			ID:          id,
			Title:       title,
			Description: description,
			DueAt:       due.At,
			DueAllDay:   due.AllDay,
			DueZone:     due.Zone,
			RemindAt:    remindAtOf(remind),
			StartsAt:    meeting.StartsAt,
			EndsAt:      meeting.EndsAt,
			Position:    position,
			ProjectID:   projectID,
			CreatedBy:   c.UserID,
			CreatedAt:   now,
			UpdatedAt:   now,
		})
		if err != nil {
			return err
		}
		return s.bus.Publish(ctx, q, bus.TodoCreated{
			ActorID:   c.UserID,
			TodoID:    id,
			Title:     title,
			ProjectID: projectID,
			At:        now,
		})
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create todo: %v", err)
	}
	return todoView(row).toProto(true), nil
}

func (s *Todo) UpdateTodo(ctx context.Context, req *doxv1.UpdateTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}

	var title *string
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			return nil, status.Error(codes.InvalidArgument, "title cannot be empty")
		}
		if len(t) > maxTitleLen {
			return nil, status.Errorf(codes.InvalidArgument, "title exceeds %d bytes", maxTitleLen)
		}
		title = &t
	}
	var description sql.NullString
	if req.Description != nil {
		description, err = normalizeDescription(req.Description)
		if err != nil {
			return nil, err
		}
	}

	now := s.now()
	var view todoView
	err = runInTx(ctx, s.db, s.q, func(q *queries.Queries) error {
		// Read, authorize, patch, and publish inside one transaction so the
		// completion event and each partial update see the same row version.
		current, err := q.GetTodo(ctx, id)
		if err != nil {
			return translateGetTodoErr(err, id)
		}
		view = todoView(current)
		if err := assertWritable(ctx, q, c.UserID, view); err != nil {
			return err
		}

		// due/remind resolve against the current row, so patching only
		// all_day or only due_zone validates against the effective deadline.
		due, err := normalizeDue(dueOf(view), req.DueAt, req.DueAllDay, req.DueZone, now)
		if err != nil {
			return err
		}
		remind, err := normalizeRemindAt(req.RemindAt, now)
		if err != nil {
			return err
		}
		// The window resolves against the current row too, so "the meeting ends
		// later" is one field while the pair stays complete.
		meeting, err := normalizeMeeting(meetingOf(view), req.StartsAt, req.EndsAt, now)
		if err != nil {
			return err
		}

		if title != nil {
			row, err := q.UpdateTodoTitle(ctx, queries.UpdateTodoTitleParams{
				Title: *title, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}
		if req.Done != nil {
			row, err := q.UpdateTodoDone(ctx, queries.UpdateTodoDoneParams{
				Done: *req.Done, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}
		if req.Description != nil {
			row, err := q.UpdateTodoDescription(ctx, queries.UpdateTodoDescriptionParams{
				Description: description, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}
		if due != nil {
			row, err := q.UpdateTodoDue(ctx, queries.UpdateTodoDueParams{
				DueAt: due.At, DueAllDay: due.AllDay, DueZone: due.Zone, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}
		if remind != nil {
			row, err := q.UpdateTodoRemind(ctx, queries.UpdateTodoRemindParams{
				RemindAt: *remind, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}
		if meeting != nil {
			row, err := q.UpdateTodoMeeting(ctx, queries.UpdateTodoMeetingParams{
				StartsAt: meeting.StartsAt, EndsAt: meeting.EndsAt, UpdatedAt: now, ID: id,
			})
			if err != nil {
				return updateTodoError(err, id)
			}
			view = todoView(row)
		}

		if !current.Done && view.Done {
			return s.bus.Publish(ctx, q, bus.TodoCompleted{
				ActorID:   c.UserID,
				TodoID:    id,
				Title:     view.Title,
				ProjectID: view.ProjectID,
				At:        now,
			})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return view.toProto(true), nil
}

func updateTodoError(err error, id string) error {
	if errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.NotFound, "todo %q not found", id)
	}
	return status.Errorf(codes.Internal, "update todo: %v", err)
}

func (s *Todo) DeleteTodo(ctx context.Context, req *doxv1.DeleteTodoRequest) (*doxv1.DeleteTodoResponse, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}
	existing, err := s.q.GetTodo(ctx, id)
	if err != nil {
		return nil, translateGetTodoErr(err, id)
	}
	if err := assertWritable(ctx, s.q, c.UserID, todoView(existing)); err != nil {
		return nil, err
	}
	if _, err := s.q.DeleteTodo(ctx, id); err != nil {
		return nil, status.Errorf(codes.Internal, "delete todo: %v", err)
	}
	return &doxv1.DeleteTodoResponse{}, nil
}

// MoveTodo reorders a todo inside its own list scope (a project, or the
// caller's Inbox) by placing it directly after an anchor row and renumbering
// the scope densely.
//
// Not an activity verb: nothing about the work changed, only where it sits, so
// no bus message is published -- otherwise the feed would fill with "moved".
func (s *Todo) MoveTodo(ctx context.Context, req *doxv1.MoveTodoRequest) (*doxv1.Todo, error) {
	c := caller.MustFrom(ctx)
	id, err := s.resolveID(ctx, c.UserID, req.GetId())
	if err != nil {
		return nil, err
	}

	now := s.now()
	var view todoView
	err = runInTx(ctx, s.db, s.q, func(q *queries.Queries) error {
		current, err := q.GetTodo(ctx, id)
		if err != nil {
			return translateGetTodoErr(err, id)
		}
		view = todoView(current)
		if err := assertWritable(ctx, q, c.UserID, view); err != nil {
			return err
		}

		// One predicate for both scopes: '' means the caller's Inbox.
		rows, err := q.ListScopeTodos(ctx, queries.ListScopeTodosParams{
			ProjectID: view.ProjectID.String,
			UserID:    c.UserID,
		})
		if err != nil {
			return err
		}
		order := make([]queries.ListScopeTodosRow, 0, len(rows))
		for _, row := range rows {
			if row.ID != id {
				order = append(order, row)
			}
		}

		target := 0
		if req.AfterId != nil && *req.AfterId != "" {
			anchor, err := s.resolveID(ctx, c.UserID, *req.AfterId)
			if err != nil {
				return err
			}
			if anchor == id {
				// Dropped on itself: the list is already what the caller meant.
				return nil
			}
			at := -1
			for i, row := range order {
				if row.ID == anchor {
					at = i
					break
				}
			}
			if at < 0 {
				return status.Errorf(codes.InvalidArgument, "after_id %q is not in this list", *req.AfterId)
			}
			target = at + 1
		}

		next := make([]queries.ListScopeTodosRow, 0, len(order)+1)
		next = append(next, order[:target]...)
		next = append(next, queries.ListScopeTodosRow{ID: id})
		next = append(next, order[target:]...)

		// Dense renumber, highest = top. Rows already at their target are
		// skipped, and only the moved row's updated_at moves -- the diff other
		// clients see stays "one todo moved", not "the whole list changed".
		for i, row := range next {
			pos := int64(len(next) - 1 - i)
			if row.ID == id {
				touched, err := q.TouchTodoPosition(ctx, queries.TouchTodoPositionParams{
					Position: pos, UpdatedAt: now, ID: id,
				})
				if err != nil {
					return updateTodoError(err, id)
				}
				view = todoView(touched)
				continue
			}
			if row.Position == pos {
				continue
			}
			if err := q.SetTodoPosition(ctx, queries.SetTodoPositionParams{
				Position: pos, ID: row.ID,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return view.toProto(true), nil
}

// resolveID accepts either a full ULID or a unique prefix (scoped to the
// caller's visible todos) and returns the canonical 26-char id.
func (s *Todo) resolveID(ctx context.Context, userID, raw string) (string, error) {
	if raw == "" {
		return "", status.Error(codes.InvalidArgument, "id is required")
	}
	normalized := strings.ToUpper(raw)
	if len(normalized) > ulidLen {
		return "", status.Errorf(codes.InvalidArgument, "id too long (%d > %d)", len(normalized), ulidLen)
	}
	if len(normalized) == ulidLen {
		return normalized, nil
	}
	matches, err := s.q.FindTodoIDsByPrefix(ctx, queries.FindTodoIDsByPrefixParams{
		Prefix: normalized,
		UserID: userID,
	})
	if err != nil {
		return "", status.Errorf(codes.Internal, "resolve prefix: %v", err)
	}
	switch len(matches) {
	case 0:
		return "", status.Errorf(codes.NotFound, "no todo matches prefix %q", raw)
	case 1:
		return matches[0], nil
	default:
		return "", status.Errorf(codes.FailedPrecondition, "prefix %q matches multiple todos — specify more characters", raw)
	}
}

// assertVisible returns NotFound if the caller cannot see the todo.
func (s *Todo) assertVisible(ctx context.Context, userID string, t todoView) error {
	if !t.ProjectID.Valid {
		if t.CreatedBy == userID {
			return nil
		}
		return status.Errorf(codes.NotFound, "todo %q not found", t.ID)
	}
	return authz.CanReadProject(ctx, s.q, userID, t.ProjectID.String)
}

// assertWritable returns NotFound for invisible todos and PermissionDenied for
// read-only access.
func assertWritable(ctx context.Context, q *queries.Queries, userID string, t todoView) error {
	if !t.ProjectID.Valid {
		if t.CreatedBy == userID {
			return nil
		}
		return status.Errorf(codes.NotFound, "todo %q not found", t.ID)
	}
	return authz.CanWriteProjectTodos(ctx, q, userID, t.ProjectID.String)
}

func translateGetTodoErr(err error, id string) error {
	if errors.Is(err, sql.ErrNoRows) {
		return status.Errorf(codes.NotFound, "todo %q not found", id)
	}
	return status.Errorf(codes.Internal, "get todo: %v", err)
}

// todoView mirrors the column layout returned by every todo query — sqlc
// generates a distinct row type per query, but they're structurally identical,
// so we convert through this single shape for assertions + proto mapping.
type todoView struct {
	ID          string
	Title       string
	Done        bool
	Description sql.NullString
	DueAt       sql.NullInt64
	DueAllDay   bool
	DueZone     sql.NullString
	RemindAt    sql.NullInt64
	StartsAt    sql.NullInt64
	EndsAt      sql.NullInt64
	Position    int64
	ProjectID   sql.NullString
	CreatedBy   string
	CreatedAt   int64
	UpdatedAt   int64
}

// dueOf extracts the deadline triple from a row so patches can be resolved
// against what is stored.
func dueOf(t todoView) dueValues {
	return dueValues{At: t.DueAt, AllDay: t.DueAllDay, Zone: t.DueZone}
}

// dueValues is the deadline triple as stored. AllDay and Zone are
// meaningless without At, which normalizeDue enforces.
type dueValues struct {
	At     sql.NullInt64
	AllDay bool
	Zone   sql.NullString
}

// normalizeDue resolves a create/patch request for due_at / due_all_day /
// due_zone against the current values. Returns nil when the request touches
// none of the three, so the caller skips the UPDATE entirely.
//
// Patch semantics match the rest of the service: an absent field is
// "unchanged", 0 clears the deadline (and with it all_day/zone), an empty
// string clears the zone.
func normalizeDue(cur dueValues, at *int64, allDay *bool, zone *string, now int64) (*dueValues, error) {
	if at == nil && allDay == nil && zone == nil {
		return nil, nil
	}
	next := cur
	if at != nil {
		if *at == 0 {
			next = dueValues{}
		} else {
			if err := validateInstant("due_at", *at, now); err != nil {
				return nil, err
			}
			next.At = sql.NullInt64{Int64: *at, Valid: true}
		}
	}
	if allDay != nil {
		next.AllDay = *allDay
	}
	if zone != nil {
		z := strings.TrimSpace(*zone)
		switch {
		case z == "":
			next.Zone = sql.NullString{}
		case next.At.Valid:
			if _, err := time.LoadLocation(z); err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "due_zone %q is not a known IANA zone", z)
			}
			next.Zone = sql.NullString{String: z, Valid: true}
		default:
			return nil, status.Error(codes.InvalidArgument, "due_zone requires due_at")
		}
	}
	if !next.At.Valid && (next.AllDay || next.Zone.Valid) {
		return nil, status.Error(codes.InvalidArgument, "due_all_day and due_zone require due_at")
	}
	return &next, nil
}

// normalizeRemindAt resolves a remind_at patch. 0 clears it (falling back to
// due_at in the reminder scan). Past instants are allowed: importing history or
// dragging a deadline into the past must not fail; the notifier's grace window
// decides whether they fire.
func normalizeRemindAt(raw *int64, now int64) (*sql.NullInt64, error) {
	if raw == nil {
		return nil, nil
	}
	if *raw == 0 {
		cleared := sql.NullInt64{}
		return &cleared, nil
	}
	if err := validateInstant("remind_at", *raw, now); err != nil {
		return nil, err
	}
	set := sql.NullInt64{Int64: *raw, Valid: true}
	return &set, nil
}

func remindAtOf(v *sql.NullInt64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return *v
}

// meetingValues is the optional meeting window as stored. Both sides or
// neither: a half window is not a fact anyone can act on.
type meetingValues struct {
	StartsAt sql.NullInt64
	EndsAt   sql.NullInt64
}

func meetingOf(t todoView) meetingValues {
	return meetingValues{StartsAt: t.StartsAt, EndsAt: t.EndsAt}
}

// normalizeMeeting resolves a starts_at/ends_at create or patch against the
// current window. Returns nil when the request touches neither field, so the
// caller skips the UPDATE.
//
// Patch semantics: absent = unchanged; 0 on either side clears the whole
// window; otherwise the effective pair -- stored value plus what the patch
// sets -- must be complete and ordered. That way "the meeting ends an hour
// later" is one field, and no patch can leave a start without an end.
func normalizeMeeting(cur meetingValues, start, end *int64, now int64) (*meetingValues, error) {
	if start == nil && end == nil {
		return nil, nil
	}
	if (start != nil && *start == 0) || (end != nil && *end == 0) {
		return &meetingValues{}, nil
	}
	next := cur
	if start != nil {
		if err := validateInstant("starts_at", *start, now); err != nil {
			return nil, err
		}
		next.StartsAt = sql.NullInt64{Int64: *start, Valid: true}
	}
	if end != nil {
		if err := validateInstant("ends_at", *end, now); err != nil {
			return nil, err
		}
		next.EndsAt = sql.NullInt64{Int64: *end, Valid: true}
	}
	if !next.StartsAt.Valid || !next.EndsAt.Valid {
		return nil, status.Error(codes.InvalidArgument, "starts_at and ends_at must be set together")
	}
	if next.EndsAt.Int64 <= next.StartsAt.Int64 {
		return nil, status.Error(codes.InvalidArgument, "ends_at must be after starts_at")
	}
	return &next, nil
}

func validateInstant(field string, ms, now int64) error {
	if ms < 0 {
		return status.Errorf(codes.InvalidArgument, "%s must be a unix millisecond timestamp", field)
	}
	if ms > now+maxScheduleHorizonMs {
		return status.Errorf(codes.InvalidArgument, "%s is too far in the future", field)
	}
	return nil
}

func (t todoView) toProto(includeDescription bool) *doxv1.Todo {
	out := &doxv1.Todo{
		Id:        t.ID,
		Title:     t.Title,
		Done:      t.Done,
		CreatedBy: t.CreatedBy,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
	if t.ProjectID.Valid {
		v := t.ProjectID.String
		out.ProjectId = &v
	}
	if includeDescription && t.Description.Valid {
		v := t.Description.String
		out.Description = &v
	}
	if t.DueAt.Valid {
		at := t.DueAt.Int64
		out.DueAt = &at
		allDay := t.DueAllDay
		out.DueAllDay = &allDay
		if t.DueZone.Valid {
			z := t.DueZone.String
			out.DueZone = &z
		}
	}
	if t.RemindAt.Valid {
		at := t.RemindAt.Int64
		out.RemindAt = &at
	}
	out.Position = t.Position
	if t.StartsAt.Valid {
		at := t.StartsAt.Int64
		out.StartsAt = &at
	}
	if t.EndsAt.Valid {
		at := t.EndsAt.Int64
		out.EndsAt = &at
	}
	return out
}

// normalizeDescription trims trailing whitespace, treats an empty string as
// unset (NULL in the DB), and enforces an upper-bound on size. Returns the
// value the caller should persist.
func normalizeDescription(raw *string) (sql.NullString, error) {
	if raw == nil {
		return sql.NullString{}, nil
	}
	v := strings.TrimRight(*raw, " \t\r\n")
	if v == "" {
		return sql.NullString{}, nil
	}
	if len(v) > maxDescriptionLen {
		return sql.NullString{}, status.Errorf(codes.InvalidArgument, "description exceeds %d bytes", maxDescriptionLen)
	}
	return sql.NullString{String: v, Valid: true}, nil
}

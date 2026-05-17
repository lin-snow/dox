package handler

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const defaultInviteTTL = 24 * time.Hour

// Invite implements InviteService. Two flavors of invite share one storage:
//   - Server invite (project_id unset): owner only. Brings a new user onto the
//     server via AuthService.Register.
//   - Project invite (project_id set): project owner only. New users redeem
//     via Register; existing users redeem via AcceptInvite.
type Invite struct {
	doxv1.UnimplementedInviteServiceServer
	q   *queries.Queries
	now func() int64
}

func NewInvite(q *queries.Queries) *Invite {
	return &Invite{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Invite) CreateInvite(ctx context.Context, req *doxv1.CreateInviteRequest) (*doxv1.Invite, error) {
	c := caller.MustFrom(ctx)
	ttl := time.Duration(req.GetTtlMs()) * time.Millisecond
	if ttl <= 0 {
		ttl = defaultInviteTTL
	}

	var (
		projectID sql.NullString
		role      sql.NullString
	)
	switch {
	case req.ProjectId == nil || *req.ProjectId == "":
		// Server invite — owner only.
		if c.Role != caller.RoleOwner {
			return nil, status.Error(codes.PermissionDenied, "only the server owner may issue server invites")
		}
	default:
		// Project invite — project owner only, role required.
		if req.Role == nil || (*req.Role != authz.RoleEditor && *req.Role != authz.RoleViewer) {
			return nil, status.Error(codes.InvalidArgument, "role must be 'editor' or 'viewer' for project invites")
		}
		if err := authz.CanAdminProject(ctx, s.q, c.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		projectID = sql.NullString{String: *req.ProjectId, Valid: true}
		role = sql.NullString{String: *req.Role, Valid: true}
	}

	code, err := authn.GenerateCode()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "generate code: %v", err)
	}
	now := s.now()
	expires := now + ttl.Milliseconds()
	if err := s.q.CreateInvite(ctx, queries.CreateInviteParams{
		CodeHash:  authn.HashInviteCode(code),
		IssuedBy:  c.UserID,
		ProjectID: projectID,
		Role:      role,
		CreatedAt: now,
		ExpiresAt: expires,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "store invite: %v", err)
	}
	return &doxv1.Invite{
		Code:      code,
		IssuedBy:  c.UserID,
		ProjectId: projectID.String,
		Role:      role.String,
		CreatedAt: now,
		ExpiresAt: expires,
	}, nil
}

func (s *Invite) AcceptInvite(ctx context.Context, req *doxv1.AcceptInviteRequest) (*doxv1.AcceptInviteResponse, error) {
	c := caller.MustFrom(ctx)
	if req.GetCode() == "" {
		return nil, status.Error(codes.InvalidArgument, "code is required")
	}
	now := s.now()
	row, err := s.q.ConsumeInvite(ctx, queries.ConsumeInviteParams{
		Now:      now,
		UsedAt:   sql.NullInt64{Int64: now, Valid: true},
		UsedBy:   sql.NullString{String: c.UserID, Valid: true},
		CodeHash: authn.HashInviteCode(req.GetCode()),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "invite code is invalid, expired, or already used")
		}
		return nil, status.Errorf(codes.Internal, "consume invite: %v", err)
	}
	if !row.ProjectID.Valid {
		// Server invites have no project — they only make sense via Register.
		return nil, status.Error(codes.FailedPrecondition, "server invites must be redeemed via Register on a fresh client")
	}
	if err := s.q.AddProjectMember(ctx, queries.AddProjectMemberParams{
		ProjectID: row.ProjectID.String,
		UserID:    c.UserID,
		Role:      row.Role.String,
		AddedAt:   now,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "add member: %v", err)
	}
	return &doxv1.AcceptInviteResponse{
		ProjectId: row.ProjectID.String,
		Role:      row.Role.String,
	}, nil
}

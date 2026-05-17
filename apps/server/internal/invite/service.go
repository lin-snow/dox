// Package invite implements the InviteService gRPC handler.
//
// Two flavors of invite share one storage table:
//   - Server invite (project_id unset): owner only. Brings a new user onto the
//     server via AuthService.Register.
//   - Project invite (project_id set): project owner only. New users redeem
//     via Register; existing users redeem via AcceptInvite.
package invite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/auth"
	"github.com/lin-snow/dox/apps/server/internal/authctx"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

const defaultInviteTTL = 24 * time.Hour

type Service struct {
	doxv1.UnimplementedInviteServiceServer
	q   *queries.Queries
	now func() int64
}

func NewService(q *queries.Queries) *Service {
	return &Service{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Service) CreateInvite(ctx context.Context, req *doxv1.CreateInviteRequest) (*doxv1.Invite, error) {
	caller := authctx.MustFrom(ctx)
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
		if caller.Role != authctx.RoleOwner {
			return nil, status.Error(codes.PermissionDenied, "only the server owner may issue server invites")
		}
	default:
		// Project invite — project owner only, role required.
		if req.Role == nil || (*req.Role != authz.RoleEditor && *req.Role != authz.RoleViewer) {
			return nil, status.Error(codes.InvalidArgument, "role must be 'editor' or 'viewer' for project invites")
		}
		if err := authz.CanAdminProject(ctx, s.q, caller.UserID, *req.ProjectId); err != nil {
			return nil, err
		}
		projectID = sql.NullString{String: *req.ProjectId, Valid: true}
		role = sql.NullString{String: *req.Role, Valid: true}
	}

	code, err := auth.GenerateCode()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "generate code: %v", err)
	}
	now := s.now()
	expires := now + ttl.Milliseconds()
	if err := s.q.CreateInvite(ctx, queries.CreateInviteParams{
		CodeHash:  auth.HashInviteCode(code),
		IssuedBy:  caller.UserID,
		ProjectID: projectID,
		Role:      role,
		CreatedAt: now,
		ExpiresAt: expires,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "store invite: %v", err)
	}
	return &doxv1.Invite{
		Code:      code,
		IssuedBy:  caller.UserID,
		ProjectId: projectID.String,
		Role:      role.String,
		CreatedAt: now,
		ExpiresAt: expires,
	}, nil
}

func (s *Service) AcceptInvite(ctx context.Context, req *doxv1.AcceptInviteRequest) (*doxv1.AcceptInviteResponse, error) {
	caller := authctx.MustFrom(ctx)
	if req.GetCode() == "" {
		return nil, status.Error(codes.InvalidArgument, "code is required")
	}
	now := s.now()
	row, err := s.q.ConsumeInvite(ctx, queries.ConsumeInviteParams{
		Now:      now,
		UsedAt:   sql.NullInt64{Int64: now, Valid: true},
		UsedBy:   sql.NullString{String: caller.UserID, Valid: true},
		CodeHash: auth.HashInviteCode(req.GetCode()),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "invite code is invalid, expired, or already used")
		}
		return nil, status.Errorf(codes.Internal, "consume invite: %v", err)
	}
	if !row.ProjectID.Valid {
		// Server invites have no project — they only make sense via Register.
		// AcceptInvite is for already-on-server users, who don't need to be re-created.
		return nil, status.Error(codes.FailedPrecondition, "server invites must be redeemed via Register on a fresh client")
	}
	if err := s.q.AddProjectMember(ctx, queries.AddProjectMemberParams{
		ProjectID: row.ProjectID.String,
		UserID:    caller.UserID,
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

package handler

import (
	"context"
	"database/sql"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/authz"
	"github.com/lin-snow/dox/apps/server/internal/bus"
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
	db     *sql.DB
	q      *queries.Queries
	bus    *bus.Bus
	secret []byte
	now    func() int64
}

func NewInvite(db *sql.DB, q *queries.Queries, b *bus.Bus, secret []byte) *Invite {
	return &Invite{
		db:     db,
		q:      q,
		bus:    b,
		secret: secret,
		now:    func() int64 { return time.Now().UTC().UnixMilli() },
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
		if c.Role != caller.RoleOwner {
			return nil, status.Error(codes.PermissionDenied, "only the server owner may issue server invites")
		}
	default:
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
		CodeHash:  authn.KeyedHashInviteCode(s.secret, code),
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
	var projectID, role string
	err := runInTx(ctx, s.db, s.q, func(q *queries.Queries) error {
		row, err := consumeInvite(ctx, q, s.secret, req.GetCode(), sql.NullString{String: c.UserID, Valid: true}, now)
		if err != nil {
			return err
		}
		if !row.ProjectID.Valid {
			// Rollback restores used_at: rejecting a server invite here must
			// not burn a code the owner can still hand to a new user.
			return status.Error(codes.FailedPrecondition, "server invites must be redeemed via Register on a fresh client")
		}
		projectID = row.ProjectID.String
		role = row.Role.String

		if err := q.AddProjectMember(ctx, queries.AddProjectMemberParams{
			ProjectID: projectID,
			UserID:    c.UserID,
			Role:      role,
			AddedAt:   now,
		}); err != nil {
			if isUniqueConstraint(err) {
				return status.Error(codes.AlreadyExists, "already a member of this project")
			}
			return status.Errorf(codes.Internal, "add member: %v", err)
		}
		proj, err := q.GetProject(ctx, projectID)
		if err != nil {
			return status.Errorf(codes.Internal, "load project: %v", err)
		}
		return s.bus.Publish(ctx, q, bus.MemberJoined{
			ActorID:     c.UserID,
			ProjectID:   projectID,
			ProjectName: proj.Name,
			At:          now,
		})
	})
	if err != nil {
		return nil, err
	}
	return &doxv1.AcceptInviteResponse{
		ProjectId: projectID,
		Role:      role,
	}, nil
}

func (s *Invite) ListOutgoingInvites(ctx context.Context, _ *doxv1.ListOutgoingInvitesRequest) (*doxv1.ListOutgoingInvitesResponse, error) {
	c := caller.MustFrom(ctx)
	rows, err := s.q.ListOutgoingInvitesByUser(ctx, queries.ListOutgoingInvitesByUserParams{
		IssuedBy: c.UserID,
		Now:      s.now(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list invites: %v", err)
	}
	out := make([]*doxv1.OutgoingInvite, 0, len(rows))
	for _, r := range rows {
		out = append(out, &doxv1.OutgoingInvite{
			CodeHash:    r.CodeHash,
			ProjectId:   r.ProjectID.String,
			ProjectName: r.ProjectName.String,
			Role:        r.Role.String,
			CreatedAt:   r.CreatedAt,
			ExpiresAt:   r.ExpiresAt,
		})
	}
	return &doxv1.ListOutgoingInvitesResponse{Invites: out}, nil
}

func (s *Invite) RevokeInvite(ctx context.Context, req *doxv1.RevokeInviteRequest) (*doxv1.RevokeInviteResponse, error) {
	c := caller.MustFrom(ctx)
	if req.GetCodeHash() == "" {
		return nil, status.Error(codes.InvalidArgument, "code_hash is required")
	}
	n, err := s.q.RevokeInviteByIssuer(ctx, queries.RevokeInviteByIssuerParams{
		CodeHash: req.GetCodeHash(),
		IssuedBy: c.UserID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "revoke invite: %v", err)
	}
	if n == 0 {
		return nil, status.Error(codes.NotFound, "invite not found")
	}
	return &doxv1.RevokeInviteResponse{}, nil
}

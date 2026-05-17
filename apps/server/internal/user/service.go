// Package user implements the UserService gRPC handler: self introspection,
// owner-only user/settings administration, and per-user device management.
package user

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/auth"
	"github.com/lin-snow/dox/apps/server/internal/authctx"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/settings"
)

const (
	defaultPairTTL = 60 * time.Second
	maxDeviceName  = 64
)

type Service struct {
	doxv1.UnimplementedUserServiceServer
	q   *queries.Queries
	now func() int64
}

func NewService(q *queries.Queries) *Service {
	return &Service{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *Service) GetMe(ctx context.Context, _ *doxv1.GetMeRequest) (*doxv1.User, error) {
	caller := authctx.MustFrom(ctx)
	u, err := s.q.GetUserByID(ctx, caller.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}
	return userToProto(u), nil
}

func (s *Service) ListUsers(ctx context.Context, _ *doxv1.ListUsersRequest) (*doxv1.ListUsersResponse, error) {
	caller := authctx.MustFrom(ctx)
	if caller.Role != authctx.RoleOwner {
		return nil, status.Error(codes.PermissionDenied, "only the server owner may list users")
	}
	rows, err := s.q.ListUsers(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list users: %v", err)
	}
	out := make([]*doxv1.User, 0, len(rows))
	for _, u := range rows {
		out = append(out, userToProto(u))
	}
	return &doxv1.ListUsersResponse{Users: out}, nil
}

func (s *Service) DeleteUser(ctx context.Context, req *doxv1.DeleteUserRequest) (*doxv1.DeleteUserResponse, error) {
	caller := authctx.MustFrom(ctx)
	if caller.Role != authctx.RoleOwner {
		return nil, status.Error(codes.PermissionDenied, "only the server owner may delete users")
	}
	id := req.GetId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if id == caller.UserID {
		return nil, status.Error(codes.FailedPrecondition, "owner cannot delete self")
	}
	// Refuse to delete users who still own projects. The FK is ON DELETE
	// RESTRICT so the DB would refuse anyway, but a clear error is friendlier.
	owned, err := s.q.CountProjectsOwnedBy(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "count projects: %v", err)
	}
	if owned > 0 {
		return nil, status.Errorf(codes.FailedPrecondition, "user owns %d project(s); delete or transfer them first", owned)
	}
	n, err := s.q.DeleteUserByID(ctx, id)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "delete user: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "user %q not found", id)
	}
	return &doxv1.DeleteUserResponse{}, nil
}

func (s *Service) GetServerSettings(ctx context.Context, _ *doxv1.GetServerSettingsRequest) (*doxv1.ServerSettings, error) {
	caller := authctx.MustFrom(ctx)
	if caller.Role != authctx.RoleOwner {
		return nil, status.Error(codes.PermissionDenied, "only the server owner may read settings")
	}
	open, err := settings.GetRegistrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get settings: %v", err)
	}
	return &doxv1.ServerSettings{RegistrationOpen: open}, nil
}

func (s *Service) UpdateServerSettings(ctx context.Context, req *doxv1.UpdateServerSettingsRequest) (*doxv1.ServerSettings, error) {
	caller := authctx.MustFrom(ctx)
	if caller.Role != authctx.RoleOwner {
		return nil, status.Error(codes.PermissionDenied, "only the server owner may update settings")
	}
	if req.RegistrationOpen != nil {
		if err := settings.SetRegistrationOpen(ctx, s.q, *req.RegistrationOpen); err != nil {
			return nil, status.Errorf(codes.Internal, "set settings: %v", err)
		}
	}
	open, err := settings.GetRegistrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get settings: %v", err)
	}
	return &doxv1.ServerSettings{RegistrationOpen: open}, nil
}

func (s *Service) ListMyDevices(ctx context.Context, _ *doxv1.ListMyDevicesRequest) (*doxv1.ListMyDevicesResponse, error) {
	caller := authctx.MustFrom(ctx)
	rows, err := s.q.ListDeviceTokensForUser(ctx, caller.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list devices: %v", err)
	}
	out := make([]*doxv1.Device, 0, len(rows))
	for _, d := range rows {
		out = append(out, &doxv1.Device{
			Id:         d.ID,
			UserId:     d.UserID,
			Name:       d.Name,
			CreatedAt:  d.CreatedAt,
			LastSeenAt: d.LastSeenAt,
		})
	}
	return &doxv1.ListMyDevicesResponse{Devices: out}, nil
}

func (s *Service) CreatePairingCode(ctx context.Context, req *doxv1.CreatePairingCodeRequest) (*doxv1.CreatePairingCodeResponse, error) {
	caller := authctx.MustFrom(ctx)
	name := strings.TrimSpace(req.GetDeviceName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "device_name is required")
	}
	if len(name) > maxDeviceName {
		return nil, status.Errorf(codes.InvalidArgument, "device_name exceeds %d bytes", maxDeviceName)
	}
	ttl := time.Duration(req.GetTtlMs()) * time.Millisecond
	if ttl <= 0 {
		ttl = defaultPairTTL
	}
	code, err := auth.CreatePairingCode(ctx, s.q, caller.UserID, name, ttl)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create pairing code: %v", err)
	}
	return &doxv1.CreatePairingCodeResponse{
		Code:      code,
		ExpiresAt: s.now() + ttl.Milliseconds(),
	}, nil
}

func (s *Service) RevokeMyDevice(ctx context.Context, req *doxv1.RevokeMyDeviceRequest) (*doxv1.RevokeMyDeviceResponse, error) {
	caller := authctx.MustFrom(ctx)
	id := req.GetDeviceId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "device_id is required")
	}
	n, err := s.q.DeleteDeviceTokenForUser(ctx, queries.DeleteDeviceTokenForUserParams{
		ID:     id,
		UserID: caller.UserID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "revoke device: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "no device with id %q", id)
	}
	return &doxv1.RevokeMyDeviceResponse{}, nil
}

func userToProto(u queries.User) *doxv1.User {
	return &doxv1.User{
		Id:        u.ID,
		Name:      u.Name,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}

// avoid unused import in environments where errors isn't referenced.
var _ = errors.New
var _ sql.NullString

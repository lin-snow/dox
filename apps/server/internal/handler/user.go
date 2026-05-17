// Package handler hosts the gRPC service handlers for all dox proto services.
// One struct per domain; the User struct implements both AuthService (public
// Register / Redeem) and UserService (authenticated self + admin endpoints).
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
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/caller"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/version"
)

const (
	maxUserNameLen   = 64
	maxDeviceNameLen = 64
	defaultPairTTL   = 60 * time.Second

	settingRegistrationOpen = "registration_open"
)

// User implements both AuthService (Register, RedeemPairingCode) and
// UserService (GetMe, ListUsers, DeleteUser, settings, device management).
type User struct {
	doxv1.UnimplementedAuthServiceServer
	doxv1.UnimplementedUserServiceServer
	q   *queries.Queries
	now func() int64
}

func NewUser(q *queries.Queries) *User {
	return &User{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

// ============================================================
// AuthService — public RPCs (no Bearer required)
// ============================================================

// ServerInfo exposes just enough server state for a pre-login UI to pick the
// right onboarding branch: whether the server has any users (first registrant
// becomes owner) and whether open registration is enabled.
func (s *User) ServerInfo(ctx context.Context, _ *doxv1.ServerInfoRequest) (*doxv1.ServerInfoResponse, error) {
	count, err := s.q.CountUsers(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "count users: %v", err)
	}
	open, err := registrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "load settings: %v", err)
	}
	v := version.Get()
	return &doxv1.ServerInfoResponse{
		HasUsers:         count > 0,
		RegistrationOpen: open,
		Version:          v.Version,
		Commit:           v.Commit,
	}, nil
}

// Register creates a new user and their first device. The first-ever caller
// becomes the owner. Subsequent callers need an invite code, or
// registration_open=true.
func (s *User) Register(ctx context.Context, req *doxv1.RegisterRequest) (*doxv1.RegisterResponse, error) {
	userName := strings.TrimSpace(req.GetUserName())
	deviceName := strings.TrimSpace(req.GetDeviceName())
	if userName == "" {
		return nil, status.Error(codes.InvalidArgument, "user_name is required")
	}
	if deviceName == "" {
		return nil, status.Error(codes.InvalidArgument, "device_name is required")
	}
	if len(userName) > maxUserNameLen {
		return nil, status.Errorf(codes.InvalidArgument, "user_name exceeds %d bytes", maxUserNameLen)
	}
	if len(deviceName) > maxDeviceNameLen {
		return nil, status.Errorf(codes.InvalidArgument, "device_name exceeds %d bytes", maxDeviceNameLen)
	}

	count, err := s.q.CountUsers(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "count users: %v", err)
	}
	isFirstUser := count == 0

	var (
		role            = caller.RoleMember
		joinProjectID   sql.NullString
		joinProjectRole sql.NullString
	)
	switch {
	case isFirstUser:
		// First user always wins, regardless of invite/registration policy.
		role = caller.RoleOwner
	case req.InviteCode != nil && *req.InviteCode != "":
		now := s.now()
		row, err := s.q.ConsumeInvite(ctx, queries.ConsumeInviteParams{
			Now:      now,
			UsedAt:   sql.NullInt64{Int64: now, Valid: true},
			UsedBy:   sql.NullString{}, // user_id not yet known
			CodeHash: authn.HashInviteCode(*req.InviteCode),
		})
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, status.Error(codes.NotFound, "invite code is invalid, expired, or already used")
			}
			return nil, status.Errorf(codes.Internal, "consume invite: %v", err)
		}
		joinProjectID = row.ProjectID
		joinProjectRole = row.Role
	default:
		open, err := registrationOpen(ctx, s.q)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "load settings: %v", err)
		}
		if !open {
			return nil, status.Error(codes.PermissionDenied, "registration is closed; ask the server owner for an invite code")
		}
	}

	userID := ulid.Make().String()
	if _, err := s.q.CreateUser(ctx, queries.CreateUserParams{
		ID:        userID,
		Name:      userName,
		Role:      role,
		CreatedAt: s.now(),
	}); err != nil {
		// UNIQUE constraint on users.name surfaces here.
		return nil, status.Errorf(codes.AlreadyExists, "user_name is taken or db error: %v", err)
	}

	if joinProjectID.Valid && joinProjectRole.Valid {
		if err := s.q.AddProjectMember(ctx, queries.AddProjectMemberParams{
			ProjectID: joinProjectID.String,
			UserID:    userID,
			Role:      joinProjectRole.String,
			AddedAt:   s.now(),
		}); err != nil {
			return nil, status.Errorf(codes.Internal, "add project member: %v", err)
		}
	}

	// First-time deployment: seed the owner's Inbox with a few onboarding
	// example todos so the TUI doesn't open to a blank "nothing here" screen.
	// Only the very first registrant gets this — everyone else (invited
	// members, open-registration sign-ups) lands on an empty Inbox.
	if isFirstUser {
		s.seedExampleTodos(ctx, userID)
	}

	token, deviceID, err := s.issueDeviceToken(ctx, userID, deviceName)
	if err != nil {
		return nil, err
	}
	return &doxv1.RegisterResponse{
		Token:      token,
		UserId:     userID,
		UserName:   userName,
		Role:       role,
		DeviceId:   deviceID,
		DeviceName: deviceName,
	}, nil
}

// RedeemPairingCode binds a fresh device token to the user that issued the
// code via UserService.CreatePairingCode. No new user is created.
func (s *User) RedeemPairingCode(ctx context.Context, req *doxv1.RedeemPairingCodeRequest) (*doxv1.RedeemPairingCodeResponse, error) {
	code := authn.NormalizeCode(req.GetCode())
	if code == "" {
		return nil, status.Error(codes.InvalidArgument, "code is required")
	}
	row, err := s.q.ConsumePairingCode(ctx, queries.ConsumePairingCodeParams{
		Code: code,
		Now:  s.now(),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "pairing code is invalid, expired, or already used")
		}
		return nil, status.Errorf(codes.Internal, "consume pairing code: %v", err)
	}

	user, err := s.q.GetUserByID(ctx, row.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "load user: %v", err)
	}

	token, deviceID, err := s.issueDeviceToken(ctx, row.UserID, row.Name)
	if err != nil {
		return nil, err
	}
	return &doxv1.RedeemPairingCodeResponse{
		Token:      token,
		DeviceId:   deviceID,
		DeviceName: row.Name,
		UserId:     row.UserID,
		UserName:   user.Name,
	}, nil
}

// ============================================================
// UserService — self introspection + per-user device management
// ============================================================

func (s *User) GetMe(ctx context.Context, _ *doxv1.GetMeRequest) (*doxv1.User, error) {
	c := caller.MustFrom(ctx)
	u, err := s.q.GetUserByID(ctx, c.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}
	return userToProto(u), nil
}

func (s *User) ListMyDevices(ctx context.Context, _ *doxv1.ListMyDevicesRequest) (*doxv1.ListMyDevicesResponse, error) {
	c := caller.MustFrom(ctx)
	rows, err := s.q.ListDeviceTokensForUser(ctx, c.UserID)
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

func (s *User) CreatePairingCode(ctx context.Context, req *doxv1.CreatePairingCodeRequest) (*doxv1.CreatePairingCodeResponse, error) {
	c := caller.MustFrom(ctx)
	name := strings.TrimSpace(req.GetDeviceName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "device_name is required")
	}
	if len(name) > maxDeviceNameLen {
		return nil, status.Errorf(codes.InvalidArgument, "device_name exceeds %d bytes", maxDeviceNameLen)
	}
	ttl := time.Duration(req.GetTtlMs()) * time.Millisecond
	if ttl <= 0 {
		ttl = defaultPairTTL
	}
	code, err := authn.CreatePairingCode(ctx, s.q, c.UserID, name, ttl)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create pairing code: %v", err)
	}
	return &doxv1.CreatePairingCodeResponse{
		Code:      code,
		ExpiresAt: s.now() + ttl.Milliseconds(),
	}, nil
}

func (s *User) RevokeMyDevice(ctx context.Context, req *doxv1.RevokeMyDeviceRequest) (*doxv1.RevokeMyDeviceResponse, error) {
	c := caller.MustFrom(ctx)
	id := req.GetDeviceId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "device_id is required")
	}
	n, err := s.q.DeleteDeviceTokenForUser(ctx, queries.DeleteDeviceTokenForUserParams{
		ID:     id,
		UserID: c.UserID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "revoke device: %v", err)
	}
	if n == 0 {
		return nil, status.Errorf(codes.NotFound, "no device with id %q", id)
	}
	return &doxv1.RevokeMyDeviceResponse{}, nil
}

// ============================================================
// UserService — admin (owner-only)
// ============================================================

func (s *User) ListUsers(ctx context.Context, _ *doxv1.ListUsersRequest) (*doxv1.ListUsersResponse, error) {
	if err := requireOwner(ctx, "list users"); err != nil {
		return nil, err
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

func (s *User) DeleteUser(ctx context.Context, req *doxv1.DeleteUserRequest) (*doxv1.DeleteUserResponse, error) {
	c := caller.MustFrom(ctx)
	if c.Role != caller.RoleOwner {
		return nil, status.Error(codes.PermissionDenied, "only the server owner may delete users")
	}
	id := req.GetId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if id == c.UserID {
		return nil, status.Error(codes.FailedPrecondition, "owner cannot delete self")
	}
	// Refuse to delete users who still own projects. The FK is ON DELETE
	// RESTRICT so the DB would refuse anyway; a clear error is friendlier.
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

func (s *User) GetServerSettings(ctx context.Context, _ *doxv1.GetServerSettingsRequest) (*doxv1.ServerSettings, error) {
	if err := requireOwner(ctx, "read settings"); err != nil {
		return nil, err
	}
	open, err := registrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get settings: %v", err)
	}
	return &doxv1.ServerSettings{RegistrationOpen: open}, nil
}

func (s *User) UpdateServerSettings(ctx context.Context, req *doxv1.UpdateServerSettingsRequest) (*doxv1.ServerSettings, error) {
	if err := requireOwner(ctx, "update settings"); err != nil {
		return nil, err
	}
	if req.RegistrationOpen != nil {
		if err := setRegistrationOpen(ctx, s.q, *req.RegistrationOpen); err != nil {
			return nil, status.Errorf(codes.Internal, "set settings: %v", err)
		}
	}
	open, err := registrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get settings: %v", err)
	}
	return &doxv1.ServerSettings{RegistrationOpen: open}, nil
}

// ============================================================
// helpers
// ============================================================

// seedExampleTodos populates a fresh owner's Inbox with onboarding examples.
// Deliberately non-fatal: if a seed insert fails, the user's account is still
// created and they just see an empty Inbox — a missing example is much less
// disruptive than a failed signup, so errors are swallowed.
//
// The three seeds cover the three things a new user most needs to discover:
// (1) the [space] toggle, (2) projects + invites, (3) the global help overlay
// and basic navigation. created_at is staggered by 1ms so the "Welcome" todo
// sorts to the top of the DESC-ordered list.
func (s *User) seedExampleTodos(ctx context.Context, userID string) {
	now := s.now()
	seeds := []struct {
		title       string
		description string
	}{
		{
			title:       "Mark this todo as done with [space]",
			description: "Pressing **space** toggles a todo between open and done.\nDone todos still appear in the **Done** tab and contribute to the Activity chart at the top of the screen.",
		},
		{
			title:       "Create a project with [p] to share todos",
			description: "Projects let you collaborate with other people.\n\n- `p` in the TUI to create a project\n- `dox project invite <project-id> --role editor` from the CLI to invite someone\n\nThe person you invite redeems the code with `dox accept <code>` and joins as an editor or viewer.",
		},
		{
			title:       "Welcome to dox — press [?] anytime for keybindings",
			description: "This is your **Private** tab — todos here are visible only to you.\n\nBasics:\n- `i` to add a new todo\n- `enter` to open this detail view\n- `e` to edit, `d` to delete\n- `h` / `l` or `tab` to switch between Private and your projects\n- `?` to see the full keybinding overlay",
		},
	}
	for i, seed := range seeds {
		ts := now + int64(i)
		if _, err := s.q.CreateTodo(ctx, queries.CreateTodoParams{
			ID:          ulid.Make().String(),
			Title:       seed.title,
			Description: sql.NullString{String: seed.description, Valid: true},
			ProjectID:   sql.NullString{},
			CreatedBy:   userID,
			CreatedAt:   ts,
			UpdatedAt:   ts,
		}); err != nil {
			return
		}
	}
}

func (s *User) issueDeviceToken(ctx context.Context, userID, deviceName string) (token, deviceID string, err error) {
	token, err = authn.GenerateToken()
	if err != nil {
		return "", "", status.Errorf(codes.Internal, "generate token: %v", err)
	}
	deviceID = ulid.Make().String()
	now := s.now()
	if err := s.q.CreateDeviceToken(ctx, queries.CreateDeviceTokenParams{
		ID:         deviceID,
		UserID:     userID,
		Name:       deviceName,
		TokenHash:  authn.HashToken(token),
		CreatedAt:  now,
		LastSeenAt: now,
	}); err != nil {
		return "", "", status.Errorf(codes.Internal, "create device token: %v", err)
	}
	return token, deviceID, nil
}

func requireOwner(ctx context.Context, action string) error {
	if caller.MustFrom(ctx).Role != caller.RoleOwner {
		return status.Errorf(codes.PermissionDenied, "only the server owner may %s", action)
	}
	return nil
}

func userToProto(u queries.User) *doxv1.User {
	return &doxv1.User{
		Id:        u.ID,
		Name:      u.Name,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}

// registrationOpen / setRegistrationOpen wrap the settings KV table. Inlined
// here because the handler package is the only caller.

func registrationOpen(ctx context.Context, q *queries.Queries) (bool, error) {
	v, err := q.GetSetting(ctx, settingRegistrationOpen)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return v == "true", nil
}

func setRegistrationOpen(ctx context.Context, q *queries.Queries, open bool) error {
	val := "false"
	if open {
		val = "true"
	}
	return q.UpsertSetting(ctx, queries.UpsertSettingParams{Key: settingRegistrationOpen, Value: val})
}

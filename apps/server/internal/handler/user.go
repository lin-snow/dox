// Package handler hosts the gRPC service handlers for all dox proto services.
// One struct per domain; the User struct implements both AuthService (public
// Register / Login) and UserService (authenticated self + admin endpoints).
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
	maxUserNameLen     = 64
	maxServerNameLen   = 64
	maxServerDescLen   = 256
	uniformAuthFailMsg = "invalid username or password"

	settingRegistrationOpen = "registration_open"
	settingServerName       = "server_name"
	settingServerDesc       = "server_description"
	settingServerOwnerID    = "server_owner_id"
)

// User implements both AuthService (Register, Login) and UserService (GetMe,
// ChangePassword, ListUsers, DeleteUser, ResetUserPassword, server settings).
type User struct {
	doxv1.UnimplementedAuthServiceServer
	doxv1.UnimplementedUserServiceServer
	q      *queries.Queries
	secret []byte
	now    func() int64
}

func NewUser(q *queries.Queries, jwtSecret []byte) *User {
	return &User{
		q:      q,
		secret: jwtSecret,
		now:    func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

// ============================================================
// AuthService — public RPCs (no Bearer required)
// ============================================================

// ServerInfo exposes the state needed by a pre-login Onboarding UI: whether
// the server has any users (first registrant becomes owner), whether open
// registration is enabled, and the server's own identity (display name,
// description, owner name) so the UI can show "joining: Alice's dox · by
// alice" rather than just the URL.
func (s *User) ServerInfo(ctx context.Context, _ *doxv1.ServerInfoRequest) (*doxv1.ServerInfoResponse, error) {
	count, err := s.q.CountUsers(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "count users: %v", err)
	}
	open, err := registrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "load settings: %v", err)
	}
	name := readSetting(ctx, s.q, settingServerName)
	desc := readSetting(ctx, s.q, settingServerDesc)
	ownerID := readSetting(ctx, s.q, settingServerOwnerID)
	var ownerName string
	if ownerID != "" {
		if u, err := s.q.GetUserByID(ctx, ownerID); err == nil {
			ownerName = u.Name
		}
	}
	v := version.Get()
	return &doxv1.ServerInfoResponse{
		HasUsers:          count > 0,
		RegistrationOpen:  open,
		Version:           v.Version,
		Commit:            v.Commit,
		ServerName:        name,
		ServerDescription: desc,
		OwnerName:         ownerName,
	}, nil
}

// Register creates a new user. The first-ever caller becomes the owner and
// may inline-set the server's display name/description. Subsequent callers
// need an invite code, or registration_open=true.
func (s *User) Register(ctx context.Context, req *doxv1.RegisterRequest) (*doxv1.RegisterResponse, error) {
	userName := strings.TrimSpace(req.GetUserName())
	if userName == "" {
		return nil, status.Error(codes.InvalidArgument, "user_name is required")
	}
	if len(userName) > maxUserNameLen {
		return nil, status.Errorf(codes.InvalidArgument, "user_name exceeds %d bytes", maxUserNameLen)
	}
	if len(req.GetPassword()) < authn.MinPasswordLen {
		return nil, status.Errorf(codes.InvalidArgument, "password must be at least %d characters", authn.MinPasswordLen)
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

	pwHash, err := authn.HashPassword(req.GetPassword())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "hash password: %v", err)
	}
	userID := ulid.Make().String()
	if _, err := s.q.CreateUser(ctx, queries.CreateUserParams{
		ID:           userID,
		Name:         userName,
		PasswordHash: pwHash,
		Role:         role,
		CreatedAt:    s.now(),
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

	// First-time deployment: anchor server identity to this user, optionally
	// seed display name/description from the same Register call, and seed the
	// owner's Inbox with onboarding examples.
	if isFirstUser {
		_ = s.q.UpsertSetting(ctx, queries.UpsertSettingParams{
			Key: settingServerOwnerID, Value: userID,
		})
		if req.ServerName != nil {
			name := strings.TrimSpace(*req.ServerName)
			if name != "" && len(name) <= maxServerNameLen {
				_ = s.q.UpsertSetting(ctx, queries.UpsertSettingParams{
					Key: settingServerName, Value: name,
				})
			}
		}
		if req.ServerDescription != nil {
			desc := strings.TrimSpace(*req.ServerDescription)
			if desc != "" && len(desc) <= maxServerDescLen {
				_ = s.q.UpsertSetting(ctx, queries.UpsertSettingParams{
					Key: settingServerDesc, Value: desc,
				})
			}
		}
		s.seedExampleTodos(ctx, userID)
	}

	token, err := authn.IssueToken(s.secret, userID, userName, role, authn.DefaultTokenTTL)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "issue token: %v", err)
	}
	return &doxv1.RegisterResponse{
		Token:    token,
		UserId:   userID,
		UserName: userName,
		Role:     role,
	}, nil
}

// Login authenticates an existing user and returns a JWT.
func (s *User) Login(ctx context.Context, req *doxv1.LoginRequest) (*doxv1.LoginResponse, error) {
	name := strings.TrimSpace(req.GetUserName())
	if name == "" || req.GetPassword() == "" {
		return nil, status.Error(codes.Unauthenticated, uniformAuthFailMsg)
	}
	u, err := s.q.GetUserByName(ctx, name)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.Unauthenticated, uniformAuthFailMsg)
		}
		return nil, status.Errorf(codes.Internal, "lookup user: %v", err)
	}
	if !authn.VerifyPassword(req.GetPassword(), u.PasswordHash) {
		return nil, status.Error(codes.Unauthenticated, uniformAuthFailMsg)
	}
	token, err := authn.IssueToken(s.secret, u.ID, u.Name, u.Role, authn.DefaultTokenTTL)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "issue token: %v", err)
	}
	return &doxv1.LoginResponse{
		Token:    token,
		UserId:   u.ID,
		UserName: u.Name,
		Role:     u.Role,
	}, nil
}

// ============================================================
// UserService — self
// ============================================================

func (s *User) GetMe(ctx context.Context, _ *doxv1.GetMeRequest) (*doxv1.User, error) {
	c := caller.MustFrom(ctx)
	u, err := s.q.GetUserByID(ctx, c.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}
	return userToProto(u), nil
}

func (s *User) ChangePassword(ctx context.Context, req *doxv1.ChangePasswordRequest) (*doxv1.ChangePasswordResponse, error) {
	c := caller.MustFrom(ctx)
	if len(req.GetNewPassword()) < authn.MinPasswordLen {
		return nil, status.Errorf(codes.InvalidArgument, "new password must be at least %d characters", authn.MinPasswordLen)
	}
	u, err := s.q.GetUserByID(ctx, c.UserID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}
	if !authn.VerifyPassword(req.GetOldPassword(), u.PasswordHash) {
		return nil, status.Error(codes.Unauthenticated, "old password is incorrect")
	}
	hash, err := authn.HashPassword(req.GetNewPassword())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "hash password: %v", err)
	}
	if _, err := s.q.UpdateUserPassword(ctx, queries.UpdateUserPasswordParams{
		PasswordHash: hash,
		ID:           c.UserID,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "update password: %v", err)
	}
	return &doxv1.ChangePasswordResponse{}, nil
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

// ResetUserPassword generates a fresh temp password for the target user and
// returns the plaintext to the calling owner. Intended for "user forgot their
// password" — the owner relays the temp out-of-band; the user is expected to
// ChangePassword immediately on first login.
func (s *User) ResetUserPassword(ctx context.Context, req *doxv1.ResetUserPasswordRequest) (*doxv1.ResetUserPasswordResponse, error) {
	if err := requireOwner(ctx, "reset passwords"); err != nil {
		return nil, err
	}
	id := req.GetUserId()
	if id == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if _, err := s.q.GetUserByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Errorf(codes.NotFound, "user %q not found", id)
		}
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}
	temp, err := authn.GenerateTempPassword()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "generate temp password: %v", err)
	}
	hash, err := authn.HashPassword(temp)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "hash temp password: %v", err)
	}
	if _, err := s.q.UpdateUserPassword(ctx, queries.UpdateUserPasswordParams{
		PasswordHash: hash,
		ID:           id,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "update password: %v", err)
	}
	return &doxv1.ResetUserPasswordResponse{TempPassword: temp}, nil
}

func (s *User) GetServerSettings(ctx context.Context, _ *doxv1.GetServerSettingsRequest) (*doxv1.ServerSettings, error) {
	if err := requireOwner(ctx, "read settings"); err != nil {
		return nil, err
	}
	open, err := registrationOpen(ctx, s.q)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get settings: %v", err)
	}
	return &doxv1.ServerSettings{
		RegistrationOpen:  open,
		ServerName:        readSetting(ctx, s.q, settingServerName),
		ServerDescription: readSetting(ctx, s.q, settingServerDesc),
	}, nil
}

func (s *User) UpdateServerSettings(ctx context.Context, req *doxv1.UpdateServerSettingsRequest) (*doxv1.ServerSettings, error) {
	if err := requireOwner(ctx, "update settings"); err != nil {
		return nil, err
	}
	if req.RegistrationOpen != nil {
		if err := setRegistrationOpen(ctx, s.q, *req.RegistrationOpen); err != nil {
			return nil, status.Errorf(codes.Internal, "set registration_open: %v", err)
		}
	}
	if req.ServerName != nil {
		name := strings.TrimSpace(*req.ServerName)
		if len(name) > maxServerNameLen {
			return nil, status.Errorf(codes.InvalidArgument, "server_name exceeds %d bytes", maxServerNameLen)
		}
		if err := s.q.UpsertSetting(ctx, queries.UpsertSettingParams{
			Key: settingServerName, Value: name,
		}); err != nil {
			return nil, status.Errorf(codes.Internal, "set server_name: %v", err)
		}
	}
	if req.ServerDescription != nil {
		desc := strings.TrimSpace(*req.ServerDescription)
		if len(desc) > maxServerDescLen {
			return nil, status.Errorf(codes.InvalidArgument, "server_description exceeds %d bytes", maxServerDescLen)
		}
		if err := s.q.UpsertSetting(ctx, queries.UpsertSettingParams{
			Key: settingServerDesc, Value: desc,
		}); err != nil {
			return nil, status.Errorf(codes.Internal, "set server_description: %v", err)
		}
	}
	return s.GetServerSettings(ctx, &doxv1.GetServerSettingsRequest{})
}

// ============================================================
// helpers
// ============================================================

// seedExampleTodos populates a fresh owner's Inbox with onboarding examples.
// Deliberately non-fatal: if a seed insert fails, the user's account is still
// created and they just see an empty Inbox — a missing example is much less
// disruptive than a failed signup, so errors are swallowed.
//
// created_at is staggered by 1ms so the "Welcome" todo sorts to the top of
// the DESC-ordered list.
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

// registrationOpen / setRegistrationOpen / readSetting wrap the settings KV
// table. Inlined here because the handler package is the only caller.

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

func readSetting(ctx context.Context, q *queries.Queries, key string) string {
	v, err := q.GetSetting(ctx, key)
	if err != nil {
		return ""
	}
	return v
}

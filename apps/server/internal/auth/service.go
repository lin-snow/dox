package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/settings"
)

const (
	maxUserNameLen   = 64
	maxDeviceNameLen = 64
)

// Service implements AuthService: Register (creates a user) and
// RedeemPairingCode (adds a device to an existing user).
type Service struct {
	doxv1.UnimplementedAuthServiceServer
	q   *queries.Queries
	now func() int64
}

func NewService(q *queries.Queries) *Service {
	return &Service{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

// Register creates a new user along with their first device token. The
// first-ever caller (users table empty) becomes the owner. Subsequent callers
// must present either a valid invite code or have registration_open=true.
func (s *Service) Register(ctx context.Context, req *doxv1.RegisterRequest) (*doxv1.RegisterResponse, error) {
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

	var (
		role            = "member"
		joinProjectID   sql.NullString
		joinProjectRole sql.NullString
	)
	switch {
	case count == 0:
		// Bootstrap: first user always wins, regardless of invite/registration policy.
		role = "owner"
	case req.InviteCode != nil && *req.InviteCode != "":
		hash := hashInviteCode(*req.InviteCode)
		now := s.now()
		row, err := s.q.ConsumeInvite(ctx, queries.ConsumeInviteParams{
			Now:      now,
			UsedAt:   sql.NullInt64{Int64: now, Valid: true},
			UsedBy:   sql.NullString{}, // user_id not yet known
			CodeHash: hash,
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
		open, err := settings.GetRegistrationOpen(ctx, s.q)
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

// RedeemPairingCode redeems a pairing code (issued via UserService.CreatePairingCode
// by an already-logged-in user) and returns a fresh device token bound to that
// user. No new user is created.
func (s *Service) RedeemPairingCode(ctx context.Context, req *doxv1.RedeemPairingCodeRequest) (*doxv1.RedeemPairingCodeResponse, error) {
	code := NormalizeCode(req.GetCode())
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

func (s *Service) issueDeviceToken(ctx context.Context, userID, deviceName string) (token, deviceID string, err error) {
	token, err = GenerateToken()
	if err != nil {
		return "", "", status.Errorf(codes.Internal, "generate token: %v", err)
	}
	deviceID = ulid.Make().String()
	now := s.now()
	if err := s.q.CreateDeviceToken(ctx, queries.CreateDeviceTokenParams{
		ID:         deviceID,
		UserID:     userID,
		Name:       deviceName,
		TokenHash:  HashToken(token),
		CreatedAt:  now,
		LastSeenAt: now,
	}); err != nil {
		return "", "", status.Errorf(codes.Internal, "create device token: %v", err)
	}
	return token, deviceID, nil
}

// HashInviteCode is the canonical hash function for invite codes. Plaintext
// codes are accepted from clients in any case with hyphens/spaces; we
// normalize then hash.
func HashInviteCode(code string) string {
	return hashInviteCode(code)
}

func hashInviteCode(code string) string {
	normalized := NormalizeCode(code)
	h := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(h[:])
}

package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/pair"
)

type AuthQuerier interface {
	ConsumePairingCode(ctx context.Context, arg queries.ConsumePairingCodeParams) (string, error)
	CreateDeviceToken(ctx context.Context, arg queries.CreateDeviceTokenParams) error
}

type AuthService struct {
	doxv1.UnimplementedAuthServiceServer
	q   AuthQuerier
	now func() int64
}

func NewAuthService(q AuthQuerier) *AuthService {
	return &AuthService{
		q:   q,
		now: func() int64 { return time.Now().UTC().UnixMilli() },
	}
}

func (s *AuthService) RedeemPairingCode(ctx context.Context, req *doxv1.RedeemPairingCodeRequest) (*doxv1.RedeemPairingCodeResponse, error) {
	code := pair.NormalizeCode(req.GetCode())
	if code == "" {
		return nil, status.Error(codes.InvalidArgument, "code is required")
	}

	name, err := s.q.ConsumePairingCode(ctx, queries.ConsumePairingCodeParams{
		Code: code,
		Now:  s.now(),
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "pairing code is invalid, expired, or already used")
		}
		return nil, status.Errorf(codes.Internal, "consume pairing code: %v", err)
	}

	token, err := pair.GenerateToken()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "generate token: %v", err)
	}
	id := ulid.Make().String()
	now := s.now()
	if err := s.q.CreateDeviceToken(ctx, queries.CreateDeviceTokenParams{
		ID:         id,
		Name:       name,
		TokenHash:  pair.HashToken(token),
		CreatedAt:  now,
		LastSeenAt: now,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "create device token: %v", err)
	}
	return &doxv1.RedeemPairingCodeResponse{
		Token:      token,
		DeviceId:   id,
		DeviceName: name,
	}, nil
}

package handler

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mattn/go-sqlite3"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
)

// consumeInvite redeems code inside the caller's transaction. New rows are
// keyed hashes; the legacy unkeyed digest is tried second so invites issued
// before keyed hashing still work. Either way the UPDATE is atomic: only one
// caller can flip used_at.
func consumeInvite(
	ctx context.Context,
	q *queries.Queries,
	secret []byte,
	code string,
	usedBy sql.NullString,
	now int64,
) (queries.ConsumeInviteRow, error) {
	params := queries.ConsumeInviteParams{
		Now:    now,
		UsedAt: sql.NullInt64{Int64: now, Valid: true},
		UsedBy: usedBy,
	}
	params.CodeHash = authn.KeyedHashInviteCode(secret, code)
	row, err := q.ConsumeInvite(ctx, params)
	if err == nil {
		return row, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return queries.ConsumeInviteRow{}, status.Errorf(codes.Internal, "consume invite: %v", err)
	}

	params.CodeHash = authn.LegacyHashInviteCode(code)
	row, err = q.ConsumeInvite(ctx, params)
	if err == nil {
		return row, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return queries.ConsumeInviteRow{}, status.Error(codes.NotFound, "invite code is invalid, expired, or already used")
	}
	return queries.ConsumeInviteRow{}, status.Errorf(codes.Internal, "consume invite: %v", err)
}

// createUserError distinguishes a taken username from a real database fault.
// The old handler reported every CreateUser failure as AlreadyExists, which
// hid corruption and connection errors behind a misleading message.
func createUserError(err error) error {
	if isUniqueConstraint(err) {
		return status.Error(codes.AlreadyExists, "user_name is taken")
	}
	return status.Errorf(codes.Internal, "create user: %v", err)
}

func isUniqueConstraint(err error) bool {
	var sqliteErr sqlite3.Error
	return errors.As(err, &sqliteErr) &&
		(sqliteErr.ExtendedCode == sqlite3.ErrConstraintUnique ||
			sqliteErr.ExtendedCode == sqlite3.ErrConstraintPrimaryKey)
}

// passwordHashError maps the hashing gate's failures to gRPC codes while
// preserving validation errors raised by HashPassword itself.
func passwordHashError(action string, err error) error {
	switch {
	case errors.Is(err, authn.ErrHashBusy):
		return status.Error(codes.ResourceExhausted, "server is busy hashing passwords; retry shortly")
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return status.FromContextError(err).Err()
	default:
		if _, ok := status.FromError(err); ok {
			return err
		}
		return status.Errorf(codes.Internal, "%s: %v", action, err)
	}
}

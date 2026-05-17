-- name: CreateInvite :exec
INSERT INTO invites (code_hash, issued_by, project_id, role, created_at, expires_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: ConsumeInvite :one
-- Atomically marks the invite used and returns its (project_id, role, issued_by).
-- Returns no row if missing/expired/already-used. The caller passes the same
-- timestamp for both `now` and `used_at`; we split them so sqlc infers distinct
-- types (int64 for the expires_at comparison, NullInt64 for the SET).
UPDATE invites
SET used_at = sqlc.arg('used_at'),
    used_by = sqlc.arg('used_by')
WHERE code_hash = sqlc.arg('code_hash')
  AND used_at IS NULL
  AND expires_at >= sqlc.arg('now')
RETURNING project_id, role, issued_by;

-- name: DeleteExpiredInvites :execrows
DELETE FROM invites
WHERE expires_at < ? OR used_at IS NOT NULL;

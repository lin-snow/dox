-- name: CreateInvite :exec
INSERT INTO invites (code_hash, issued_by, project_id, role, created_at, expires_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: ConsumeInvite :one
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

-- name: ListOutgoingInvitesByUser :many
SELECT i.code_hash,
       i.project_id,
       i.role,
       i.created_at,
       i.expires_at,
       p.name AS project_name
FROM invites i
LEFT JOIN projects p ON p.id = i.project_id
WHERE i.issued_by = sqlc.arg('issued_by')
  AND i.used_at IS NULL
  AND i.expires_at >= sqlc.arg('now')
ORDER BY i.created_at DESC;

-- name: RevokeInviteByIssuer :execrows
DELETE FROM invites
WHERE code_hash = sqlc.arg('code_hash')
  AND issued_by = sqlc.arg('issued_by');

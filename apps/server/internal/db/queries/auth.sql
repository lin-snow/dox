-- name: CreatePairingCode :exec
INSERT INTO pairing_codes (code, user_id, name, expires_at, used)
VALUES (?, ?, ?, ?, 0);

-- name: ConsumePairingCode :one
-- Atomically marks the code used and returns the bound user_id + device name.
-- Returns no row if the code is missing, expired, or already consumed.
UPDATE pairing_codes
SET used = 1
WHERE code = sqlc.arg('code')
  AND used = 0
  AND expires_at >= sqlc.arg('now')
RETURNING user_id, name;

-- name: DeleteExpiredPairingCodes :execrows
DELETE FROM pairing_codes
WHERE expires_at < ? OR used = 1;

-- name: CreateDeviceToken :exec
INSERT INTO device_tokens (id, user_id, name, token_hash, created_at, last_seen_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: FindDeviceByTokenHash :one
-- JOIN users so middleware can resolve caller (user_id + role) in one query.
SELECT d.id, d.user_id, d.name, d.token_hash, d.created_at, d.last_seen_at, u.role AS user_role
FROM device_tokens d
JOIN users u ON u.id = d.user_id
WHERE d.token_hash = ?
LIMIT 1;

-- name: TouchDeviceLastSeen :exec
UPDATE device_tokens
SET last_seen_at = ?
WHERE id = ?;

-- name: ListDeviceTokensForUser :many
SELECT id, user_id, name, token_hash, created_at, last_seen_at
FROM device_tokens
WHERE user_id = ?
ORDER BY created_at DESC;

-- name: ListAllDeviceTokens :many
-- Admin-only listing used by `dox-server device list`.
SELECT d.id, d.user_id, d.name, d.token_hash, d.created_at, d.last_seen_at, u.name AS user_name
FROM device_tokens d
JOIN users u ON u.id = d.user_id
ORDER BY d.created_at DESC;

-- name: DeleteDeviceTokenForUser :execrows
-- Scoped delete: caller can only revoke their own devices.
DELETE FROM device_tokens
WHERE id = ? AND user_id = ?;

-- name: DeleteDeviceTokenByID :execrows
-- Admin-level unscoped delete (used by `dox-server device revoke`).
DELETE FROM device_tokens
WHERE id = ?;

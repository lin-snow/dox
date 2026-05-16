-- name: CreatePairingCode :exec
INSERT INTO pairing_codes (code, name, expires_at, used)
VALUES (?, ?, ?, 0);

-- name: ConsumePairingCode :one
-- Atomically marks the code as used and returns its name if it was still valid.
-- Returns no row if the code is missing, expired, or already consumed.
UPDATE pairing_codes
SET used = 1
WHERE code = sqlc.arg('code')
  AND used = 0
  AND expires_at >= sqlc.arg('now')
RETURNING name;

-- name: DeleteExpiredPairingCodes :execrows
DELETE FROM pairing_codes
WHERE expires_at < ? OR used = 1;

-- name: CreateDeviceToken :exec
INSERT INTO device_tokens (id, name, token_hash, created_at, last_seen_at)
VALUES (?, ?, ?, ?, ?);

-- name: FindDeviceByTokenHash :one
SELECT id, name, token_hash, created_at, last_seen_at
FROM device_tokens
WHERE token_hash = ?
LIMIT 1;

-- name: TouchDeviceLastSeen :exec
UPDATE device_tokens
SET last_seen_at = ?
WHERE id = ?;

-- name: ListDeviceTokens :many
SELECT id, name, token_hash, created_at, last_seen_at
FROM device_tokens
ORDER BY created_at DESC;

-- name: DeleteDeviceToken :execrows
DELETE FROM device_tokens
WHERE id = ?;

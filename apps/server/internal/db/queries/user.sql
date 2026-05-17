-- name: CreateUser :one
INSERT INTO users (id, name, role, created_at)
VALUES (?, ?, ?, ?)
RETURNING id, name, role, created_at;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: GetUserByID :one
SELECT id, name, role, created_at
FROM users
WHERE id = ?
LIMIT 1;

-- name: GetUserByName :one
SELECT id, name, role, created_at
FROM users
WHERE name = ?
LIMIT 1;

-- name: ListUsers :many
SELECT id, name, role, created_at
FROM users
ORDER BY created_at ASC;

-- name: DeleteUserByID :execrows
-- Owner protection at SQL level (defense-in-depth); service layer should also enforce.
DELETE FROM users
WHERE id = ? AND role != 'owner';

-- name: GetSetting :one
SELECT value FROM settings WHERE key = ? LIMIT 1;

-- name: UpsertSetting :exec
INSERT INTO settings (key, value)
VALUES (?1, ?2)
ON CONFLICT (key) DO UPDATE SET value = ?2;

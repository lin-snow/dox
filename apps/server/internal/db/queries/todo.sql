-- name: ListTodos :many
SELECT id, title, done, created_at, updated_at
FROM todos
ORDER BY created_at DESC;

-- name: GetTodo :one
SELECT id, title, done, created_at, updated_at
FROM todos
WHERE id = ?
LIMIT 1;

-- name: CreateTodo :one
INSERT INTO todos (id, title, done, created_at, updated_at)
VALUES (?, ?, 0, ?, ?)
RETURNING id, title, done, created_at, updated_at;

-- name: UpdateTodo :one
UPDATE todos
SET title = ?, done = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, created_at, updated_at;

-- name: DeleteTodo :execrows
DELETE FROM todos
WHERE id = ?;

-- name: FindTodoIDsByPrefix :many
-- CAST forces sqlc to type prefix as non-null string instead of sql.NullString.
SELECT id FROM todos
WHERE id LIKE CAST(sqlc.arg('prefix') AS TEXT) || '%'
ORDER BY id
LIMIT 2;

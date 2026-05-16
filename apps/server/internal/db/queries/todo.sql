-- name: ListTodos :many
SELECT id, title, done, created_at, updated_at
FROM todos
ORDER BY created_at DESC;

-- name: ListTodosForUser :many
SELECT t.id, t.title, t.done, t.description, t.project_id, t.created_by, t.created_at, t.updated_at
FROM todos t
WHERE (t.project_id IS NULL AND t.created_by = sqlc.arg('user_id'))
   OR EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = t.project_id AND p.owner_id = sqlc.arg('user_id')
   )
   OR EXISTS (
        SELECT 1 FROM project_members m
        WHERE m.project_id = t.project_id AND m.user_id = sqlc.arg('user_id')
   )
ORDER BY t.created_at DESC;

-- name: ListInboxTodos :many
SELECT id, title, done, description, project_id, created_by, created_at, updated_at
FROM todos
WHERE project_id IS NULL AND created_by = sqlc.arg('user_id')
ORDER BY created_at DESC;

-- name: ListTodosInProject :many
SELECT id, title, done, description, project_id, created_by, created_at, updated_at
FROM todos
WHERE project_id = sqlc.arg('project_id')
ORDER BY created_at DESC;

-- name: GetTodo :one
SELECT id, title, done, description, project_id, created_by, created_at, updated_at
FROM todos
WHERE id = ?
LIMIT 1;

-- name: CreateTodo :one
INSERT INTO todos (id, title, done, description, project_id, created_by, created_at, updated_at)
VALUES (?, ?, 0, ?, ?, ?, ?, ?)
RETURNING id, title, done, description, project_id, created_by, created_at, updated_at;

-- name: UpdateTodo :one
UPDATE todos
SET title = ?, done = ?, description = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, project_id, created_by, created_at, updated_at;

-- name: DeleteTodo :execrows
DELETE FROM todos WHERE id = ?;

-- name: FindTodoIDsByPrefix :many
SELECT t.id FROM todos t
WHERE t.id LIKE CAST(sqlc.arg('prefix') AS TEXT) || '%'
  AND (
        (t.project_id IS NULL AND t.created_by = sqlc.arg('user_id'))
     OR EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.owner_id = sqlc.arg('user_id'))
     OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = t.project_id AND m.user_id = sqlc.arg('user_id'))
  )
ORDER BY t.id
LIMIT 2;

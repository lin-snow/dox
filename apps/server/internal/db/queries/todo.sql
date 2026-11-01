-- name: ListTodosForUser :many
SELECT t.id, t.title, t.done, t.description, t.due_at, t.due_all_day, t.due_zone, t.remind_at, t.starts_at, t.ends_at, t.position, t.project_id, t.created_by, t.created_at, t.updated_at
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
ORDER BY t.position DESC, t.created_at DESC;

-- name: ListInboxTodos :many
SELECT id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at
FROM todos
WHERE project_id IS NULL AND created_by = sqlc.arg('user_id')
ORDER BY position DESC, created_at DESC;

-- name: ListTodosInProject :many
SELECT id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at
FROM todos
WHERE project_id = sqlc.arg('project_id')
ORDER BY position DESC, created_at DESC;

-- name: GetTodo :one
SELECT id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at
FROM todos
WHERE id = ?
LIMIT 1;

-- name: NextTodoPosition :one
-- A new todo lands at the top of its scope: before manual ordering, "top" was
-- simply the newest row, and MoveTodo's dense numbering puts the first item at
-- the highest value.
--
-- project_id = '' means Inbox, which is (project_id IS NULL AND created_by =
-- user_id) -- the same scope MoveTodo renumbers. A sentinel instead of a
-- nullable arg keeps sqlc's generated params concrete.
SELECT COALESCE(MAX(position), 0) + 1 AS position
FROM todos
WHERE (CAST(sqlc.arg('project_id') AS TEXT) = '' AND project_id IS NULL AND created_by = sqlc.arg('user_id'))
   OR (project_id = CAST(sqlc.arg('project_id') AS TEXT));

-- name: CreateTodo :one
INSERT INTO todos (id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at)
VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoTitle :one
UPDATE todos
SET title = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoDone :one
UPDATE todos
SET done = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoDescription :one
UPDATE todos
SET description = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoDue :one
UPDATE todos
SET due_at = ?, due_all_day = ?, due_zone = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoRemind :one
UPDATE todos
SET remind_at = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- name: UpdateTodoMeeting :one
UPDATE todos
SET starts_at = ?, ends_at = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

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

-- Rows of one list scope, in display order, with the position they currently
-- hold. MoveTodo uses this to resolve an anchor ("put it after this one")
-- against what is actually stored, then renumbers the scope densely -- and
-- skips rows already at their target so a drag touches the minimum.
--
-- project_id = '' means Inbox, scoped to the caller -- the same predicate
-- NextTodoPosition uses to place new rows.
-- name: ListScopeTodos :many
SELECT t.id, t.position FROM todos t
WHERE (CAST(sqlc.arg('project_id') AS TEXT) = '' AND t.project_id IS NULL AND t.created_by = sqlc.arg('user_id'))
   OR (t.project_id = CAST(sqlc.arg('project_id') AS TEXT))
ORDER BY t.position DESC, t.created_at DESC, t.id DESC;

-- Silent renumber: other rows in a scope shift but nobody edited them, so
-- updated_at must not move (it is what clients diff on).
-- name: SetTodoPosition :exec
UPDATE todos SET position = ? WHERE id = ?;

-- The moved row is a real edit: bump updated_at so the activity/sync surface
-- sees it.
-- name: TouchTodoPosition :one
UPDATE todos
SET position = ?, updated_at = ?
WHERE id = ?
RETURNING id, title, done, description, due_at, due_all_day, due_zone, remind_at, starts_at, ends_at, position, project_id, created_by, created_at, updated_at;

-- Reminder scan used by internal/notifier. The window is [lo, hi] so a server
-- that was down still delivers reminders that fell inside the grace period,
-- while anything older is skipped instead of spamming on startup.
--
-- due_all_day todos are local calendar dates: the client computes their
-- reminder instant (09:00 in its own zone) and stores it in remind_at. Without
-- an explicit remind_at an all-day todo is never pinged -- never at midnight UTC.
-- name: ListDueTriggers :many
SELECT
    id,
    title,
    project_id,
    COALESCE(remind_at, due_at) AS trigger_at
FROM todos
WHERE done = 0
  AND COALESCE(remind_at, due_at) IS NOT NULL
  AND COALESCE(remind_at, due_at) >  sqlc.arg('lo')
  AND COALESCE(remind_at, due_at) <= sqlc.arg('hi')
  AND (due_all_day = 0 OR remind_at IS NOT NULL)
ORDER BY trigger_at ASC;

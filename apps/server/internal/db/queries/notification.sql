-- name: InsertNotification :execrows
INSERT INTO notifications (id, user_id, todo_id, kind, scheduled_for, todo_title, project_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (user_id, todo_id, kind, scheduled_for) DO NOTHING;

-- Recipients: the creator for an Inbox todo, owner + members for a project
-- todo. DISTINCT because an owner may also hold a member row.
-- name: ListTodoRecipients :many
SELECT DISTINCT user_id FROM (
    SELECT t.created_by AS user_id
      FROM todos t
     WHERE t.id = sqlc.arg('todo_id') AND t.project_id IS NULL
    UNION
    SELECT p.owner_id AS user_id
      FROM todos t JOIN projects p ON p.id = t.project_id
     WHERE t.id = sqlc.arg('todo_id')
    UNION
    SELECT m.user_id AS user_id
      FROM todos t JOIN project_members m ON m.project_id = t.project_id
     WHERE t.id = sqlc.arg('todo_id')
)
ORDER BY user_id;

-- name: ListNotificationsForUser :many
SELECT id, user_id, todo_id, kind, scheduled_for, todo_title, project_id, read_at, created_at
FROM notifications
WHERE user_id = sqlc.arg('user_id')
ORDER BY scheduled_for DESC, id DESC
LIMIT sqlc.arg('limit_n');

-- name: ListUnreadNotificationsForUser :many
SELECT id, user_id, todo_id, kind, scheduled_for, todo_title, project_id, read_at, created_at
FROM notifications
WHERE user_id = sqlc.arg('user_id') AND read_at IS NULL
ORDER BY scheduled_for DESC, id DESC
LIMIT sqlc.arg('limit_n');

-- name: CountUnreadNotifications :one
SELECT COUNT(*) FROM notifications
WHERE user_id = sqlc.arg('user_id') AND read_at IS NULL;

-- name: AckNotifications :execrows
UPDATE notifications
SET read_at = sqlc.arg('read_at')
WHERE user_id = sqlc.arg('user_id')
  AND read_at IS NULL
  AND id IN (sqlc.slice('ids'));

-- name: AckAllNotifications :execrows
UPDATE notifications
SET read_at = sqlc.arg('read_at')
WHERE user_id = sqlc.arg('user_id') AND read_at IS NULL;

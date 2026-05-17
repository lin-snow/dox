-- name: InsertEvent :exec
INSERT INTO events (id, verb, actor_id, project_id, target_type, target_id, target_label, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- name: ListEventsForUser :many
-- Recent events across the caller's visible projects (owned + member-of).
-- Joins users + projects so the handler returns a fully populated response
-- without follow-up queries. Visibility filter mirrors ListProjectsVisibleTo /
-- ListTodosForUser so authz semantics stay consistent across resources.
SELECT
    e.id,
    e.verb,
    e.actor_id,
    u.name      AS actor_name,
    e.project_id,
    p.name      AS project_name,
    p.color     AS project_color,
    e.target_type,
    e.target_id,
    e.target_label,
    e.created_at
FROM events e
JOIN users    u ON u.id = e.actor_id
JOIN projects p ON p.id = e.project_id
WHERE p.owner_id = sqlc.arg('user_id')
   OR EXISTS (
        SELECT 1 FROM project_members m
        WHERE m.project_id = e.project_id AND m.user_id = sqlc.arg('user_id')
   )
-- ULIDs are lexicographically time-ordered, so the id tiebreaker keeps the
-- feed stable when two events land in the same millisecond (common when a
-- mutation handler emits + the caller mutates again immediately).
ORDER BY e.created_at DESC, e.id DESC
LIMIT sqlc.arg('limit_n');

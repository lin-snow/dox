-- name: CreateProject :one
INSERT INTO projects (id, owner_id, name, description, color, archived, sort_order, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
RETURNING id, owner_id, name, description, color, archived, sort_order, created_at, updated_at;

-- name: GetProject :one
SELECT id, owner_id, name, description, color, archived, sort_order, created_at, updated_at
FROM projects
WHERE id = ?
LIMIT 1;

-- name: ListProjectsVisibleTo :many
-- All projects the user can see: owned + member-of.
SELECT p.id, p.owner_id, p.name, p.description, p.color, p.archived, p.sort_order, p.created_at, p.updated_at
FROM projects p
WHERE p.owner_id = sqlc.arg('user_id')
   OR EXISTS (
        SELECT 1 FROM project_members m
        WHERE m.project_id = p.id AND m.user_id = sqlc.arg('user_id')
   )
ORDER BY p.sort_order ASC, p.created_at ASC;

-- name: UpdateProject :one
UPDATE projects
SET name = ?, description = ?, color = ?, archived = ?, sort_order = ?, updated_at = ?
WHERE id = ?
RETURNING id, owner_id, name, description, color, archived, sort_order, created_at, updated_at;

-- name: DeleteProject :execrows
DELETE FROM projects WHERE id = ?;

-- name: AddProjectMember :exec
INSERT INTO project_members (project_id, user_id, role, added_at)
VALUES (?, ?, ?, ?)
ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role;

-- name: RemoveProjectMember :execrows
DELETE FROM project_members
WHERE project_id = ? AND user_id = ?;

-- name: ListProjectMembers :many
-- Joins on users so the client can render names without an extra round-trip
-- (and without needing the owner-only /v1/users list).
SELECT pm.user_id, u.name AS user_name, pm.role, pm.added_at
FROM project_members pm
JOIN users u ON u.id = pm.user_id
WHERE pm.project_id = ?
ORDER BY pm.added_at ASC;

-- name: GetProjectMembership :one
-- Returns the caller's role for the project, or no row if not a member.
SELECT role
FROM project_members
WHERE project_id = ? AND user_id = ?
LIMIT 1;

-- name: CountProjectsOwnedBy :one
SELECT COUNT(*) FROM projects WHERE owner_id = ?;

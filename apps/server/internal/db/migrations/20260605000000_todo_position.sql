-- +goose Up

-- Manual order inside a list scope (a project, or the creator's Inbox).
--
-- Only MoveTodo assigns meaningful values: it renumbers its whole scope
-- densely. Until the first drag every row keeps the default 0, so
-- ORDER BY position DESC, created_at DESC is exactly the old
-- created_at DESC ordering -- no backfill, no change for existing lists.
ALTER TABLE todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Covers both the scoped renumber (WHERE project_id = ?) and the list ORDER BY.
CREATE INDEX idx_todos_position ON todos(project_id, position DESC, created_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_todos_position;
ALTER TABLE todos DROP COLUMN position;

-- +goose Up
-- Pre-1.0 breaking schema change. Existing dev rows are throwaway.
DROP INDEX IF EXISTS idx_todos_created_at;
DROP TABLE  IF EXISTS todos;

CREATE TABLE todos (
    id         TEXT    PRIMARY KEY,
    title      TEXT    NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    project_id TEXT             REFERENCES projects(id) ON DELETE CASCADE,
    created_by TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_todos_project    ON todos(project_id);
CREATE INDEX idx_todos_created_by ON todos(created_by);
CREATE INDEX idx_todos_created_at ON todos(created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_todos_created_at;
DROP INDEX IF EXISTS idx_todos_created_by;
DROP INDEX IF EXISTS idx_todos_project;
DROP TABLE  IF EXISTS todos;

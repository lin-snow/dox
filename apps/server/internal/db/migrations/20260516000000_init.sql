-- +goose Up
CREATE TABLE todos (
    id         TEXT    PRIMARY KEY,
    title      TEXT    NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_todos_created_at ON todos(created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_todos_created_at;
DROP TABLE IF EXISTS todos;

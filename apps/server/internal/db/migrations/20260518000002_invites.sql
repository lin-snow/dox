-- +goose Up
CREATE TABLE invites (
    code_hash  TEXT    PRIMARY KEY,
    issued_by  TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    project_id TEXT             REFERENCES projects(id) ON DELETE CASCADE,
    role       TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    used_by    TEXT             REFERENCES users(id)
);

CREATE INDEX idx_invites_project ON invites(project_id);

-- +goose Down
DROP INDEX IF EXISTS idx_invites_project;
DROP TABLE  IF EXISTS invites;

-- +goose Up
CREATE TABLE projects (
    id          TEXT    PRIMARY KEY,
    owner_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL,
    description TEXT,
    color       TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_projects_owner ON projects(owner_id);

CREATE TABLE project_members (
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_project_members_user;
DROP TABLE  IF EXISTS project_members;
DROP INDEX IF EXISTS idx_projects_owner;
DROP TABLE  IF EXISTS projects;

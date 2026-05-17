-- +goose Up
-- Consolidated baseline schema. Pre-release: previous migrations were
-- collapsed into this single init when the auth model switched from
-- device-tokens + pairing-codes to username/password + JWT. There are no
-- production deployments to migrate from.

CREATE TABLE users (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
);

-- Generic KV for server-level config. Reserved keys:
--   registration_open   — "true" / "false"
--   server_name         — display name shown on Onboarding
--   server_description  — optional one-liner
--   server_owner_id     — stable pointer to the owner user; written atomically
--                         with the first Register
--   jwt_secret          — 32-byte base64; auto-seeded on first boot if absent.
--                         Env DOX_JWT_SECRET overrides at runtime.
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

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

CREATE TABLE todos (
    id          TEXT    PRIMARY KEY,
    title       TEXT    NOT NULL,
    description TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    project_id  TEXT             REFERENCES projects(id) ON DELETE CASCADE,
    created_by  TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_todos_project    ON todos(project_id);
CREATE INDEX idx_todos_created_by ON todos(created_by);
CREATE INDEX idx_todos_created_at ON todos(created_at DESC);

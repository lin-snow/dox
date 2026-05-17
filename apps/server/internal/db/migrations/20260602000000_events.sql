-- +goose Up
-- Append-only feed of cross-user activity inside projects. Powers the TUI's
-- right-bottom Activity panel. Three v1 verbs (todo_created, todo_completed,
-- member_joined) — all project-scoped, no directed/recipient events yet.
--
-- target_label is a snapshot at write time so a renamed/deleted target still
-- renders sensibly. Capped at 200 chars by the handler before insert.

CREATE TABLE events (
    id           TEXT    PRIMARY KEY,
    verb         TEXT    NOT NULL,
    actor_id     TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type  TEXT    NOT NULL,
    target_id    TEXT    NOT NULL,
    target_label TEXT    NOT NULL,
    created_at   INTEGER NOT NULL
);

CREATE INDEX idx_events_project_created ON events(project_id, created_at DESC);
CREATE INDEX idx_events_actor_created   ON events(actor_id,   created_at DESC);

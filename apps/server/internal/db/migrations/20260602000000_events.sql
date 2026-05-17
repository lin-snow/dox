-- +goose Up
-- Append-only feed powering the TUI's right-bottom Activity panel.
--
-- Two scopes share the table:
--   project_id IS NOT NULL → project event, visible to project owner + members
--   project_id IS NULL     → personal event, visible only to actor_id
-- The personal scope keeps the panel populated for solo users (Inbox-only,
-- no collaborators) and gives team users their own private activity beside
-- the team feed in one chronological stream.
--
-- v1 verbs: todo_created, todo_completed, member_joined.
--
-- target_label is a snapshot at write time so renamed/deleted targets still
-- render sensibly. Capped at 200 chars by the handler before insert.

CREATE TABLE events (
    id           TEXT    PRIMARY KEY,
    verb         TEXT    NOT NULL,
    actor_id     TEXT    NOT NULL          REFERENCES users(id)    ON DELETE CASCADE,
    project_id   TEXT                      REFERENCES projects(id) ON DELETE CASCADE,
    target_type  TEXT    NOT NULL,
    target_id    TEXT    NOT NULL,
    target_label TEXT    NOT NULL,
    created_at   INTEGER NOT NULL
);

CREATE INDEX idx_events_project_created ON events(project_id, created_at DESC);
CREATE INDEX idx_events_actor_created   ON events(actor_id,   created_at DESC);

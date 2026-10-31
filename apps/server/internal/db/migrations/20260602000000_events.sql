-- +goose Up

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

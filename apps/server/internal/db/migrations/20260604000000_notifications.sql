-- +goose Up

-- One row per (recipient, todo, reminder instant) — a durable delivery ledger.
--
-- Rows are only written when the reminder actually fires, and the unique key is
-- the trigger instant itself. That makes the notifier idempotent without a
-- "sent" flag (restarts, overlapping ticks and concurrent instances all collapse
-- into ON CONFLICT DO NOTHING) and makes editing a due/remind time
-- self-invalidating: the new instant is a new row, and the old one can never be
-- cancelled because it does not exist yet.
CREATE TABLE notifications (
    id            TEXT    PRIMARY KEY,
    user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    todo_id       TEXT    NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    -- "due" today; reserved for "due_soon" / "overdue" without a migration.
    kind          TEXT    NOT NULL,
    scheduled_for INTEGER NOT NULL,
    -- Snapshot of the todo title so a later rename/delete doesn't rewrite
    -- history (same rationale as events.target_label).
    todo_title    TEXT    NOT NULL,
    project_id    TEXT             REFERENCES projects(id) ON DELETE CASCADE,
    read_at       INTEGER,
    created_at    INTEGER NOT NULL,
    UNIQUE (user_id, todo_id, kind, scheduled_for)
);

-- Serve the unread list and the badge count without touching the table body.
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at, scheduled_for DESC);

-- +goose Down

DROP TABLE notifications;

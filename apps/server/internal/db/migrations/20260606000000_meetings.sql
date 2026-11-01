-- +goose Up

-- A meeting is a todo with a time window.
--
-- Two nullable columns beat a "meetings" table: project members already
-- receive reminders for project todos (notifier.ListTodoRecipients), so
-- scheduling a meeting is scheduling a todo and there is no second entity to
-- keep in sync with membership, projects or the event feed.
--
-- Independent of due_at on purpose: starts_at/ends_at is when you meet,
-- due_at is when the work is owed.
ALTER TABLE todos ADD COLUMN starts_at INTEGER;
ALTER TABLE todos ADD COLUMN ends_at   INTEGER;

-- The window is validated in the handler (ends_at > starts_at), not here:
-- SQLite cannot add a CHECK constraint to an existing table, and a partial
-- index on a dense column would cost writes for a query nobody runs yet.
CREATE INDEX idx_todos_starts_at ON todos(starts_at) WHERE starts_at IS NOT NULL;

-- +goose Down

DROP INDEX IF EXISTS idx_todos_starts_at;
ALTER TABLE todos DROP COLUMN ends_at;
ALTER TABLE todos DROP COLUMN starts_at;

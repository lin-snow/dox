-- +goose Up

-- due_at is the deadline (drives sorting / Today / overdue), remind_at is the
-- instant we ping the user. They are deliberately separate: "due Friday 18:00"
-- and "remind Thursday 09:00" are different facts, and a todo may carry a
-- reminder without a deadline at all.
ALTER TABLE todos ADD COLUMN due_at      INTEGER;
ALTER TABLE todos ADD COLUMN due_all_day INTEGER NOT NULL DEFAULT 0;
-- IANA zone the all-day deadline belongs to. Display-only: the reminder
-- instant is computed by the client and stored in remind_at.
ALTER TABLE todos ADD COLUMN due_zone    TEXT;
-- Reminder instant. NULL means "remind at due_at" (COALESCE in the trigger
-- scan), so no backfill is needed and editing due_at keeps working.
ALTER TABLE todos ADD COLUMN remind_at   INTEGER;

-- The reminder scan filters open todos by their effective trigger instant
-- COALESCE(remind_at, due_at); SQLite can use an expression index for that
-- predicate, so the only todos touched per tick are the ones that just fired.
CREATE INDEX idx_todos_trigger ON todos(COALESCE(remind_at, due_at)) WHERE done = 0;

-- +goose Down

DROP INDEX IF EXISTS idx_todos_trigger;
ALTER TABLE todos DROP COLUMN remind_at;
ALTER TABLE todos DROP COLUMN due_zone;
ALTER TABLE todos DROP COLUMN due_all_day;
ALTER TABLE todos DROP COLUMN due_at;

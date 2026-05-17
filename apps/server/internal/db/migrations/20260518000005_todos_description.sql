-- +goose Up
-- Optional long-form body for a todo. Nullable so existing rows survive the
-- migration and clients can leave it empty.
ALTER TABLE todos ADD COLUMN description TEXT;

-- +goose Down
-- SQLite supports DROP COLUMN since 3.35; goose runs each statement in its own
-- prepared statement so this is safe.
ALTER TABLE todos DROP COLUMN description;

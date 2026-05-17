-- +goose Up
CREATE TABLE users (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    role       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;

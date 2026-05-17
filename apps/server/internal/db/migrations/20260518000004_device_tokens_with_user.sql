-- +goose Up
DROP TABLE IF EXISTS device_tokens;
CREATE TABLE device_tokens (
    id           TEXT    PRIMARY KEY,
    user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    token_hash   TEXT    NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_device_tokens_user ON device_tokens(user_id);

DROP TABLE IF EXISTS pairing_codes;
CREATE TABLE pairing_codes (
    code       TEXT    PRIMARY KEY,
    user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE IF EXISTS pairing_codes;
DROP INDEX IF EXISTS idx_device_tokens_user;
DROP TABLE IF EXISTS device_tokens;

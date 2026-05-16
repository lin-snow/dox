-- +goose Up
CREATE TABLE pairing_codes (
    code       TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE device_tokens (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    token_hash   TEXT    NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS device_tokens;
DROP TABLE IF EXISTS pairing_codes;

package db

import (
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// Open opens the SQLite database, applies recommended PRAGMAs and runs goose
// migrations up to the latest version.
//
// SQLite pragmas (README §6): WAL mode, NORMAL sync, foreign keys on, 5s busy
// timeout, 64MB cache, in-memory temp store. Connection pool capped at 1 since
// SQLite serializes writes — splitting read/write *sql.DB is a v0.y concern.
func Open(path string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA cache_size = -64000",
		"PRAGMA temp_store = MEMORY",
	}
	for _, p := range pragmas {
		if _, err := conn.Exec(p); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("apply %q: %w", p, err)
		}
	}

	conn.SetMaxOpenConns(1)

	if err := migrate(conn); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return conn, nil
}

func migrate(db *sql.DB) error {
	goose.SetBaseFS(migrationFS)
	// goose's dialect identifier is "sqlite3" even though the modernc driver
	// registers itself as "sqlite".
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}
	if err := goose.Up(db, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

package db

import (
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

var pragmas = []string{
	"PRAGMA journal_mode = WAL",
	"PRAGMA synchronous = NORMAL",
	"PRAGMA foreign_keys = ON",
	"PRAGMA busy_timeout = 5000",
	"PRAGMA cache_size = -64000",
	"PRAGMA temp_store = MEMORY",
}

// Open opens the SQLite database, applies pragmas, and runs goose migrations.
// SQLite serializes writes, so the pool is capped at 1 connection.
func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	conn, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
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
	// Route goose's stdlib-log chatter ("OK 0001.sql", "no migrations to run", ...)
	// into slog at debug level so it stays out of normal startup output but is
	// still available with DOX_LOG_LEVEL=debug. Real errors propagate via goose.Up.
	goose.SetLogger(slogGooseLogger{})
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("goose set dialect: %w", err)
	}
	if err := goose.Up(db, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

type slogGooseLogger struct{}

func (slogGooseLogger) Printf(format string, v ...any) {
	slog.Debug(fmt.Sprintf(format, v...), "source", "goose")
}

// Fatalf is part of goose.Logger; the embedded library only calls Printf, but
// implement Fatalf defensively so an unexpected fatal still surfaces and exits.
func (slogGooseLogger) Fatalf(format string, v ...any) {
	slog.Error(fmt.Sprintf(format, v...), "source", "goose")
	os.Exit(1)
}

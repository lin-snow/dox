package config

import (
	"log/slog"
	"os"
	"time"
)

type Config struct {
	DBPath     string
	ListenAddr string
	LogLevel   slog.Level
	// EventRetention controls how long rows in the events table are kept.
	// A background sweeper deletes anything older. Set to 0 to disable.
	EventRetention time.Duration
}

const defaultEventRetention = 15 * 24 * time.Hour

// Logger returns a JSON slog logger configured at cfg.LogLevel, writing to
// stderr. Callers typically pass the result to slog.SetDefault.
func (cfg *Config) Logger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
}

func Load() (*Config, error) {
	cfg := &Config{
		DBPath:         getenv("DOX_DB_PATH", "./data/dox.db"),
		ListenAddr:     getenv("DOX_LISTEN_ADDR", ":8080"),
		EventRetention: defaultEventRetention,
	}
	// DOX_EVENT_RETENTION accepts a Go duration string (e.g. "360h", "168h").
	// "0" disables the sweeper.
	if raw := os.Getenv("DOX_EVENT_RETENTION"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return nil, err
		}
		cfg.EventRetention = d
	}

	switch os.Getenv("DOX_LOG_LEVEL") {
	case "debug":
		cfg.LogLevel = slog.LevelDebug
	case "warn":
		cfg.LogLevel = slog.LevelWarn
	case "error":
		cfg.LogLevel = slog.LevelError
	default:
		cfg.LogLevel = slog.LevelInfo
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

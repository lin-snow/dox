package config

import (
	"log/slog"
	"os"
)

type Config struct {
	DBPath     string
	ListenAddr string
	LogLevel   slog.Level
}

// Logger returns a JSON slog logger configured at cfg.LogLevel, writing to
// stderr. Callers typically pass the result to slog.SetDefault.
func (cfg *Config) Logger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
}

func Load() (*Config, error) {
	cfg := &Config{
		DBPath:     getenv("DOX_DB_PATH", "./dox.db"),
		ListenAddr: getenv("DOX_LISTEN_ADDR", ":8080"),
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

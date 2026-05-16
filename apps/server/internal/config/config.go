package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
)

type Config struct {
	BootstrapToken string
	DBPath         string
	ListenAddr     string
	LogLevel       slog.Level
}

func Load() (*Config, error) {
	cfg := &Config{
		BootstrapToken: os.Getenv("DOX_BOOTSTRAP_TOKEN"),
		DBPath:         getenv("DOX_DB_PATH", "./dox.db"),
		ListenAddr:     getenv("DOX_LISTEN_ADDR", ":8080"),
	}
	if cfg.BootstrapToken == "" {
		return nil, errors.New("DOX_BOOTSTRAP_TOKEN is required")
	}
	if len(cfg.BootstrapToken) < 32 {
		return nil, fmt.Errorf("DOX_BOOTSTRAP_TOKEN must be at least 32 chars, got %d", len(cfg.BootstrapToken))
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

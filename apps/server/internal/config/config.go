package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

type Config struct {
	DBPath         string
	ListenAddr     string
	LogLevel       slog.Level
	EventRetention time.Duration
	// ReminderInterval is how often the due-date sweep runs. 0 disables it.
	ReminderInterval time.Duration
	// ReminderGrace is how far back a sweep looks for reminders missed while
	// the server was down; older ones are dropped instead of replayed.
	ReminderGrace time.Duration
	// TrustProxyHeaders makes the auth rate limiter read X-Forwarded-For.
	// Enable only when a reverse proxy you control overwrites the header.
	TrustProxyHeaders bool
	// NtfyURL is the ntfy server root used for reminder pushes.
	NtfyURL string
	// NtfyTopic is the publish topic, optionally containing "{user}". Empty
	// disables the channel: a third-party push must never be on by accident.
	NtfyTopic string
	// NtfyToken is an optional bearer token for a protected ntfy instance.
	NtfyToken string
}

// defaultNtfyURL is the public relay; a self-hosted instance overrides it.
const defaultNtfyURL = "https://ntfy.sh"

const (
	defaultEventRetention = 15 * 24 * time.Hour
	// 30s keeps reminders within half a minute of their instant without
	// writing much: one indexed SELECT over open todos per tick.
	defaultReminderInterval = 30 * time.Second
	// An hour of catch-up covers restarts and deploys; anything older is noise.
	defaultReminderGrace = time.Hour
)

// Logger returns a JSON slog logger configured at cfg.LogLevel, writing to
// stderr. Callers typically pass the result to slog.SetDefault.
func (cfg *Config) Logger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))
}

func Load() (*Config, error) {
	cfg := &Config{
		DBPath:           getenv("DOX_DB_PATH", "./data/dox.db"),
		ListenAddr:       getenv("DOX_LISTEN_ADDR", ":6278"),
		EventRetention:   defaultEventRetention,
		ReminderInterval: defaultReminderInterval,
		ReminderGrace:    defaultReminderGrace,
		NtfyURL:          getenv("DOX_NTFY_URL", defaultNtfyURL),
		// No default topic on purpose: an unset topic is the opt-out.
		NtfyTopic: getenv("DOX_NTFY_TOPIC", ""),
		NtfyToken: getenv("DOX_NTFY_TOKEN", ""),
	}
	// Deliverer code joins "<base>/<topic>"; a trailing slash would make it
	// "<base>//<topic>", which some reverse proxies refuse to route.
	cfg.NtfyURL = strings.TrimRight(cfg.NtfyURL, "/")
	if err := durationEnv("DOX_EVENT_RETENTION", &cfg.EventRetention); err != nil {
		return nil, err
	}
	// "0s" is a meaningful value here: it disables the reminder sweep.
	if err := durationEnv("DOX_REMINDER_INTERVAL", &cfg.ReminderInterval); err != nil {
		return nil, err
	}
	if err := durationEnv("DOX_REMINDER_GRACE", &cfg.ReminderGrace); err != nil {
		return nil, err
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
	switch os.Getenv("DOX_TRUST_PROXY") {
	case "1", "true", "TRUE":
		cfg.TrustProxyHeaders = true
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// durationEnv sets *dst from a duration env var when present, leaving the
// caller's value (the default) untouched otherwise.
func durationEnv(key string, dst *time.Duration) error {
	raw := os.Getenv(key)
	if raw == "" {
		return nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return fmt.Errorf("%s: %w", key, err)
	}
	*dst = d
	return nil
}

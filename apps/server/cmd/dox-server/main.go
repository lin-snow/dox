package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/lin-snow/dox/apps/server/internal/app"
	"github.com/lin-snow/dox/apps/server/internal/config"
	"github.com/lin-snow/dox/apps/server/internal/version"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(cfg.Logger())

	// Logo on stderr keeps it out of any structured-log pipeline on stdout.
	fmt.Fprint(os.Stderr, version.Get().Banner())

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	return app.Run(ctx, cfg)
}

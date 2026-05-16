package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/lin-snow/dox/apps/server/internal/admin"
	"github.com/lin-snow/dox/apps/server/internal/config"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/pair"
	"github.com/lin-snow/dox/apps/server/internal/server"
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

	if len(os.Args) > 1 && !strings.HasPrefix(os.Args[1], "-") {
		return runSubcommand(cfg, os.Args[1:])
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	return server.Run(ctx, cfg)
}

func runSubcommand(cfg *config.Config, args []string) error {
	conn, err := db.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer conn.Close()
	q := queries.New(conn)
	ctx := context.Background()

	switch args[0] {
	case "pair":
		return runPair(ctx, q, args[1:])
	case "device":
		if len(args) < 2 {
			return errors.New("usage: dox-server device <list|revoke> [args...]")
		}
		switch args[1] {
		case "list":
			return runDeviceList(ctx, q)
		case "revoke":
			return runDeviceRevoke(ctx, q, args[2:])
		default:
			return fmt.Errorf("unknown device subcommand %q", args[1])
		}
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func runPair(ctx context.Context, q *queries.Queries, args []string) error {
	fs := flag.NewFlagSet("pair", flag.ContinueOnError)
	name := fs.String("name", "", "device name (required)")
	ttl := fs.Duration("ttl", 60*time.Second, "code lifetime")
	if err := fs.Parse(args); err != nil {
		return err
	}
	code, err := admin.CreatePairingCode(ctx, q, *name, *ttl)
	if err != nil {
		return err
	}
	fmt.Printf("Pairing code: %s\n", pair.FormatCode(code))
	fmt.Printf("Device name:  %s\n", *name)
	fmt.Printf("Expires in:   %s\n", *ttl)
	return nil
}

func runDeviceList(ctx context.Context, q *queries.Queries) error {
	devices, err := admin.ListDevices(ctx, q)
	if err != nil {
		return err
	}
	if len(devices) == 0 {
		fmt.Println("(no devices registered)")
		return nil
	}
	for _, d := range devices {
		fmt.Printf("%s  %-20s  created %s  last seen %s\n",
			d.ID,
			d.Name,
			time.UnixMilli(d.CreatedAt).UTC().Format(time.RFC3339),
			time.UnixMilli(d.LastSeenAt).UTC().Format(time.RFC3339),
		)
	}
	return nil
}

func runDeviceRevoke(ctx context.Context, q *queries.Queries, args []string) error {
	if len(args) < 1 {
		return errors.New("usage: dox-server device revoke <id>")
	}
	id := args[0]
	if err := admin.RevokeDevice(ctx, q, id); err != nil {
		if errors.Is(err, admin.ErrDeviceNotFound) {
			return fmt.Errorf("no device with id %q", id)
		}
		return err
	}
	fmt.Printf("Revoked device %q\n", id)
	return nil
}

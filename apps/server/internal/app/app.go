// Package app is the composition root: it opens the database, builds the
// handlers, wires them onto the grpc-gateway mux behind the authn middleware,
// and runs the HTTP listener until ctx is cancelled.
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/authn"
	"github.com/lin-snow/dox/apps/server/internal/bus"
	"github.com/lin-snow/dox/apps/server/internal/config"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
	"github.com/lin-snow/dox/apps/server/internal/notifier"
	"github.com/lin-snow/dox/apps/server/internal/version"
	"github.com/lin-snow/dox/apps/server/internal/webui"
)

const shutdownTimeout = 5 * time.Second

func Run(ctx context.Context, cfg *config.Config) error {
	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer func() {
		if err := dbConn.Close(); err != nil {
			slog.Error("db close failed", "err", err)
		}
	}()

	q := queries.New(dbConn)

	secret, err := authn.LoadOrCreateJWTSecret(ctx, q)
	if err != nil {
		return fmt.Errorf("load jwt secret: %w", err)
	}

	b := bus.New(bus.NewActivityRecorder())
	user := handler.NewUser(dbConn, q, b, secret)
	proj := handler.NewProject(q)
	inv := handler.NewInvite(dbConn, q, b, secret)
	td := handler.NewTodo(dbConn, q, b)
	ev := handler.NewEvent(q)
	nt := handler.NewNotification(q)

	mux := runtime.NewServeMux()
	if err := doxv1.RegisterAuthServiceHandlerServer(ctx, mux, user); err != nil {
		return fmt.Errorf("register auth: %w", err)
	}
	if err := doxv1.RegisterUserServiceHandlerServer(ctx, mux, user); err != nil {
		return fmt.Errorf("register user: %w", err)
	}
	if err := doxv1.RegisterProjectServiceHandlerServer(ctx, mux, proj); err != nil {
		return fmt.Errorf("register project: %w", err)
	}
	if err := doxv1.RegisterInviteServiceHandlerServer(ctx, mux, inv); err != nil {
		return fmt.Errorf("register invite: %w", err)
	}
	if err := doxv1.RegisterTodoServiceHandlerServer(ctx, mux, td); err != nil {
		return fmt.Errorf("register todo: %w", err)
	}
	if err := doxv1.RegisterEventServiceHandlerServer(ctx, mux, ev); err != nil {
		return fmt.Errorf("register event: %w", err)
	}
	if err := doxv1.RegisterNotificationServiceHandlerServer(ctx, mux, nt); err != nil {
		return fmt.Errorf("register notification: %w", err)
	}

	authLimiter := authn.NewRateLimiter(cfg.TrustProxyHeaders)

	// /healthz is mounted outside the auth chain: probes never carry a token,
	// and keeping it off the gateway leaves publicPaths untouched.
	//
	// The minimal web UI is public for the same reason, but for different
	// bytes: it is plain static asset served on two exact routes, and it
	// authenticates itself against /v1 with a bearer token. So publicPaths
	// keeps its three entries and no cookie/CSRF surface exists. Only GET /
	// and GET /static/... are claimed; everything else falls through to the
	// API mux below.
	root := http.NewServeMux()
	root.HandleFunc("/healthz", healthHandler(dbConn))
	web := webui.Handler()
	root.Handle("GET /{$}", web)
	root.Handle("GET /static/", web)
	root.Handle("/", authn.Middleware(authn.NewJWTVerifier(secret))(authLimiter.Middleware(mux)))

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           root,
		ReadHeaderTimeout: 5 * time.Second,
	}

	sweepCtx, stopSweep := context.WithCancel(ctx)
	defer stopSweep()
	sweepDone := make(chan struct{})
	go func() {
		defer close(sweepDone)
		runEventRetention(sweepCtx, q, cfg.EventRetention, time.Now)
	}()

	// The reminder sweep owns its own goroutine for the same reason: it talks to
	// the DB outside any request transaction and must drain before the pool
	// closes.
	reminderCtx, stopReminders := context.WithCancel(ctx)
	defer stopReminders()
	reminderDone := make(chan struct{})
	go func() {
		defer close(reminderDone)
		notifier.New(q, notifier.Config{
			Interval: cfg.ReminderInterval,
			Grace:    cfg.ReminderGrace,
			Now:      time.Now,
		}).Run(reminderCtx)
	}()

	v := version.Get()
	errCh := make(chan error, 1)
	go func() {
		slog.Info("server listening",
			"addr", cfg.ListenAddr,
			"db", cfg.DBPath,
			"version", v.Version,
			"commit", v.Commit,
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	case err := <-errCh:
		return err
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	err = srv.Shutdown(shutdownCtx)
	stopSweep()
	<-sweepDone
	stopReminders()
	<-reminderDone
	return err
}

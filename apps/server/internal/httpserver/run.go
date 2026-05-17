// Package httpserver wires the gRPC services into a grpc-gateway HTTP mux and
// runs it until the supplied context is cancelled.
package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/auth"
	"github.com/lin-snow/dox/apps/server/internal/config"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/invite"
	"github.com/lin-snow/dox/apps/server/internal/project"
	"github.com/lin-snow/dox/apps/server/internal/todo"
	"github.com/lin-snow/dox/apps/server/internal/user"
)

const shutdownTimeout = 5 * time.Second

func Run(ctx context.Context, cfg *config.Config) error {
	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer dbConn.Close()

	q := queries.New(dbConn)

	mux := runtime.NewServeMux()
	if err := doxv1.RegisterAuthServiceHandlerServer(ctx, mux, auth.NewService(q)); err != nil {
		return fmt.Errorf("register auth handlers: %w", err)
	}
	if err := doxv1.RegisterUserServiceHandlerServer(ctx, mux, user.NewService(q)); err != nil {
		return fmt.Errorf("register user handlers: %w", err)
	}
	if err := doxv1.RegisterProjectServiceHandlerServer(ctx, mux, project.NewService(q)); err != nil {
		return fmt.Errorf("register project handlers: %w", err)
	}
	if err := doxv1.RegisterInviteServiceHandlerServer(ctx, mux, invite.NewService(q)); err != nil {
		return fmt.Errorf("register invite handlers: %w", err)
	}
	if err := doxv1.RegisterTodoServiceHandlerServer(ctx, mux, todo.NewService(q)); err != nil {
		return fmt.Errorf("register todo handlers: %w", err)
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           auth.Middleware(auth.NewVerifier(q))(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("server listening", "addr", cfg.ListenAddr, "db", cfg.DBPath)
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
	return srv.Shutdown(shutdownCtx)
}

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
	"github.com/lin-snow/dox/apps/server/internal/config"
	"github.com/lin-snow/dox/apps/server/internal/db"
	"github.com/lin-snow/dox/apps/server/internal/db/queries"
	"github.com/lin-snow/dox/apps/server/internal/handler"
	"github.com/lin-snow/dox/apps/server/internal/version"
)

const shutdownTimeout = 5 * time.Second

func Run(ctx context.Context, cfg *config.Config) error {
	dbConn, err := db.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer dbConn.Close()

	q := queries.New(dbConn)

	user := handler.NewUser(q)
	proj := handler.NewProject(q)
	inv := handler.NewInvite(q)
	td := handler.NewTodo(q)

	mux := runtime.NewServeMux()
	// user.User implements both AuthService (public) and UserService (auth).
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

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           authn.Middleware(authn.NewVerifier(q))(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

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
	return srv.Shutdown(shutdownCtx)
}

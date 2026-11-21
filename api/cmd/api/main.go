// Command api is the REST server: profiles, rooms (create, join by code, settings), and game
// history. Contract: shared/openapi.yaml. Setup notes: api/SETUP.md.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"schmegettes/api/internal/account"
	"schmegettes/api/internal/admin"
	"schmegettes/api/internal/games"
	"schmegettes/api/internal/hostaccess"
	"schmegettes/api/internal/rooms"
	"schmegettes/api/internal/stats"
	"schmegettes/golib/auth"
	"schmegettes/golib/db"
	"schmegettes/golib/logging"
)

// commit is set at build time: go build -ldflags "-X main.commit=$GIT_SHA".
var commit = "unknown"

func main() {
	logging.Setup("api", getenv("APP_ENV", "local"), getenv("LOG_LEVEL", "info"))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := db.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		slog.Error("database unavailable", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	verifier, err := auth.NewVerifier(ctx, os.Getenv("SUPABASE_JWKS_URL"))
	if err != nil {
		slog.Error("jwks unavailable", "err", err)
		os.Exit(1)
	}

	rt := routes{
		admin:  admin.Handler{Store: admin.PGStore{DB: database}},
		rooms:  rooms.Handler{Store: rooms.PGStore{DB: database}, SocketBase: getenv("GAME_SOCKET_BASE_URL", "ws://localhost:3002")},
		games:  games.Handler{Store: games.PGStore{DB: database}},
		host:   hostaccess.Handler{Store: hostaccess.PGStore{DB: database}},
		me:     account.Handler{Store: account.PGStore{DB: database}},
		stats:  stats.Handler{Store: stats.PGStore{DB: database}},
		limits: newLimits(),
		ping:   database.Ping,
	}
	srv := &http.Server{
		Addr:              ":" + getenv("PORT", "3001"),
		Handler:           handler(rt, verifier, strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("listening", "addr", srv.Addr, "commit", buildCommit())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	// Let in-flight requests finish before the instance exits.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown failed", "err", err)
	}
}

func buildCommit() string {
	if commit != "unknown" {
		return commit
	}
	return getenv("GIT_SHA", commit)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

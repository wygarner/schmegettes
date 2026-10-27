// Command game is the realtime game server: one WebSocket per player, server-authoritative
// game state, buzzer ordering, timers, and judging. See docs/system-docs/architecture/realtime-game-server.md.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"schmegettes/game/internal/room"
	"schmegettes/game/internal/socket"
	"schmegettes/golib/auth"
	"schmegettes/golib/db"
	"schmegettes/golib/logging"
)

// commit is set at build time: go build -ldflags "-X main.commit=$GIT_SHA".
var commit = "unknown"

func main() {
	logging.Setup("game", getenv("APP_ENV", "local"), getenv("LOG_LEVEL", "info"))

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

	// Rooms stop with roomsCtx, which ends at shutdown so sockets close cleanly.
	roomsCtx, stopRooms := context.WithCancel(context.Background())
	defer stopRooms()
	hub := room.NewHub(roomsCtx, room.PGStore{DB: database}, room.DefaultConfig())

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		status, code := "ok", http.StatusOK
		if err := database.Ping(r.Context()); err != nil {
			status, code = "degraded", http.StatusServiceUnavailable
		}
		writeJSON(w, code, map[string]string{"status": status})
	})
	mux.HandleFunc("GET /version", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "game", "commit": buildCommit()})
	})
	mux.Handle("GET /rooms/{roomID}/ws", socket.Handler{
		Verifier: verifier,
		Members:  socket.PGMembership{DB: database},
		Hub:      hub,
		Origins:  strings.Split(os.Getenv("ALLOWED_ORIGINS"), ","),
	})

	srv := &http.Server{
		Addr:              ":" + getenv("PORT", "3002"),
		Handler:           mux,
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
	// Close every room's sockets (clients reconnect to the next instance), then stop serving.
	stopRooms()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
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

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

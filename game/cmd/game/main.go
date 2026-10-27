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
	"syscall"
	"time"
)

// commit is set at build time: go build -ldflags "-X main.commit=$GIT_SHA".
var commit = "unknown"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel()})).
		With("service", "game", "env", getenv("APP_ENV", "local"))
	slog.SetDefault(logger)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /version", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "game", "commit": buildCommit()})
	})
	mux.HandleFunc("GET /rooms/{roomID}/ws", func(w http.ResponseWriter, r *http.Request) {
		// Implemented by the first gameplay task: verify the Supabase JWT, check room
		// membership, upgrade, and attach the connection to the room's state machine.
		http.Error(w, "not implemented", http.StatusNotImplemented)
	})

	srv := &http.Server{
		Addr:              ":" + getenv("PORT", "3002"),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("listening", "addr", srv.Addr, "commit", buildCommit())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	// Give open rooms time to hand off ownership before the instance exits.
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

func logLevel() slog.Level {
	var level slog.Level
	if err := level.UnmarshalText([]byte(getenv("LOG_LEVEL", "info"))); err != nil {
		return slog.LevelInfo
	}
	return level
}

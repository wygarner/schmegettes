// Package logging sets up the JSON slog logger every Go service uses.
// Conventions: docs/system-docs/operations/logging-conventions.md.
package logging

import (
	"log/slog"
	"os"
)

// Setup installs and returns a JSON logger with the service's base fields.
// level is a slog level name ("debug", "info", …); anything else means info.
func Setup(service, env, level string) *slog.Logger {
	var l slog.Level
	if err := l.UnmarshalText([]byte(level)); err != nil {
		l = slog.LevelInfo
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l})).
		With("service", service, "env", env)
	slog.SetDefault(logger)
	return logger
}

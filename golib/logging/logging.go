// Package logging sets up the JSON slog logger every Go service uses.
// Conventions: docs/system-docs/operations/logging-conventions.md.
package logging

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel/trace"
)

// Setup installs and returns a JSON logger with the service's base fields.
// level is a slog level name ("debug", "info", …); anything else means info.
//
// Records go to stdout as JSON and also to the global OpenTelemetry logger provider. That
// provider is a no-op until telemetry.Setup installs an exporter, so without one only stdout
// sees them.
func Setup(service, env, level string) *slog.Logger {
	var l slog.Level
	if err := l.UnmarshalText([]byte(level)); err != nil {
		l = slog.LevelInfo
	}
	logger := slog.New(NewHandler(os.Stdout, l, otelslog.NewHandler(service))).
		With("service", service, "env", env)
	slog.SetDefault(logger)
	return logger
}

// NewHandler writes JSON to w and, when otel is non-nil, the same record to otel. Records
// below level go nowhere. trace_id and span_id are added when the context carries a span.
func NewHandler(w io.Writer, level slog.Level, otel slog.Handler) slog.Handler {
	hs := []slog.Handler{slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})}
	if otel != nil {
		hs = append(hs, otel)
	}
	return fanout{level: level, handlers: hs}
}

type fanout struct {
	level    slog.Level
	handlers []slog.Handler
}

func (f fanout) Enabled(ctx context.Context, l slog.Level) bool {
	if l < f.level {
		return false
	}
	for _, h := range f.handlers {
		if h.Enabled(ctx, l) {
			return true
		}
	}
	return false
}

func (f fanout) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	var errs []error
	for _, h := range f.handlers {
		if h.Enabled(ctx, r.Level) {
			errs = append(errs, h.Handle(ctx, r.Clone()))
		}
	}
	return errors.Join(errs...)
}

func (f fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	hs := make([]slog.Handler, len(f.handlers))
	for i, h := range f.handlers {
		hs[i] = h.WithAttrs(attrs)
	}
	return fanout{level: f.level, handlers: hs}
}

func (f fanout) WithGroup(name string) slog.Handler {
	hs := make([]slog.Handler, len(f.handlers))
	for i, h := range f.handlers {
		hs[i] = h.WithGroup(name)
	}
	return fanout{level: f.level, handlers: hs}
}

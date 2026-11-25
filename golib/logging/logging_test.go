package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"testing"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

type recordExporter struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (e *recordExporter) Export(_ context.Context, rs []sdklog.Record) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, r := range rs {
		e.records = append(e.records, r.Clone())
	}
	return nil
}
func (*recordExporter) Shutdown(context.Context) error   { return nil }
func (*recordExporter) ForceFlush(context.Context) error { return nil }

func TestFanoutWritesTheSameRecordToBothSinks(t *testing.T) {
	exp := &recordExporter{}
	lp := sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp)))
	var out bytes.Buffer
	logger := slog.New(NewHandler(&out, slog.LevelInfo, otelslog.NewHandler("test", otelslog.WithLoggerProvider(lp)))).
		With("service", "test")

	logger.Info("room crashed", "room_id", "r1")
	logger.Debug("below level")

	var line map[string]any
	if err := json.Unmarshal(out.Bytes(), &line); err != nil {
		t.Fatalf("stdout is not one JSON line: %q", out.String())
	}
	if line["msg"] != "room crashed" || line["room_id"] != "r1" || line["service"] != "test" {
		t.Fatalf("stdout line = %v", line)
	}
	if len(exp.records) != 1 {
		t.Fatalf("otel records = %d, want 1", len(exp.records))
	}
	rec := exp.records[0]
	if rec.Body().AsString() != "room crashed" {
		t.Fatalf("otel body = %q", rec.Body().AsString())
	}
	got := map[string]string{}
	rec.WalkAttributes(func(kv attribute.KeyValue) bool {
		got[string(kv.Key)] = kv.Value.AsString()
		return true
	})
	if got["room_id"] != "r1" || got["service"] != "test" {
		t.Fatalf("otel attributes = %v", got)
	}
}

func TestTraceIDsAreAddedInsideASpan(t *testing.T) {
	var out bytes.Buffer
	logger := slog.New(NewHandler(&out, slog.LevelInfo, nil))
	tp := sdktrace.NewTracerProvider()
	ctx, span := tp.Tracer("test").Start(context.Background(), "s")
	defer span.End()

	logger.InfoContext(ctx, "request")

	var line map[string]any
	if err := json.Unmarshal(out.Bytes(), &line); err != nil {
		t.Fatal(err)
	}
	if line["trace_id"] != span.SpanContext().TraceID().String() || line["span_id"] != span.SpanContext().SpanID().String() {
		t.Fatalf("line = %v, want the span's ids", line)
	}

	out.Reset()
	logger.Info("no span")
	if bytes.Contains(out.Bytes(), []byte("trace_id")) {
		t.Fatalf("trace_id outside a span: %s", out.String())
	}
}

// Setup's otel handler follows the global provider, so a provider installed later
// (telemetry.Setup runs after logging.Setup) still receives records.
func TestSetupReachesAProviderInstalledLater(t *testing.T) {
	prevLogger, prevProvider := slog.Default(), otel.GetLoggerProvider()
	t.Cleanup(func() { slog.SetDefault(prevLogger); otel.SetLoggerProvider(prevProvider) })

	logger := Setup("test", "local", "info")
	exp := &recordExporter{}
	otel.SetLoggerProvider(sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(exp))))
	logger.Info("after setup")

	if len(exp.records) != 1 {
		t.Fatalf("otel records = %d, want 1", len(exp.records))
	}
}

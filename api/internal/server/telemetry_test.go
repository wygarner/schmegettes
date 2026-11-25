package server

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"schmegettes/golib/logging"
)

func TestSpansUseTheRoutePatternAndTheLogLineCarriesTheTrace(t *testing.T) {
	rec := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec))

	var out bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(logging.NewHandler(&out, slog.LevelInfo, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/rooms/{roomId}", func(w http.ResponseWriter, _ *http.Request) {})
	h := otelhttp.NewHandler(Log(Authenticate(verifier{})(Route(mux))), "api", otelhttp.WithTracerProvider(tp))

	req := httptest.NewRequest("GET", "/v1/rooms/0b9a2c1e-1111-2222-3333-444455556666", nil)
	req.Header.Set("Authorization", "Bearer good")
	h.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	if len(spans) != 1 {
		t.Fatalf("spans = %d, want 1", len(spans))
	}
	if got := spans[0].Name(); got != "GET /v1/rooms/{roomId}" {
		t.Fatalf("span name = %q, want the route pattern", got)
	}

	var line map[string]any
	if err := json.Unmarshal(out.Bytes(), &line); err != nil {
		t.Fatalf("log: %q", out.String())
	}
	if line["trace_id"] != spans[0].SpanContext().TraceID().String() {
		t.Fatalf("request line trace_id = %v, want %s", line["trace_id"], spans[0].SpanContext().TraceID())
	}
}

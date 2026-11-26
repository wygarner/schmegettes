package telemetry

import (
	"context"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
)

func TestSetupWithoutEndpointIsANoop(t *testing.T) {
	t.Setenv(EndpointEnv, "")
	tp, mp, lp := otel.GetTracerProvider(), otel.GetMeterProvider(), otel.GetLoggerProvider()

	shutdown, err := Setup(context.Background(), "api", "local", "abc")
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if otel.GetTracerProvider() != tp || otel.GetMeterProvider() != mp || otel.GetLoggerProvider() != lp {
		t.Fatal("Setup replaced a global provider with no endpoint configured")
	}
}

func TestResourceCarriesTheEnvironment(t *testing.T) {
	got := map[string]string{}
	for _, kv := range Resource("game", "staging", "abc").Attributes() {
		got[string(kv.Key)] = kv.Value.AsString()
	}
	want := map[string]string{"service.name": "game", "service.version": "abc", "deployment.environment": "staging"}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s = %q, want %q", k, got[k], v)
		}
	}
}

func TestSetupWithEndpointInstallsProviders(t *testing.T) {
	t.Setenv(EndpointEnv, "http://127.0.0.1:1") // nothing listens; nothing is exported
	tp, mp, lp := otel.GetTracerProvider(), otel.GetMeterProvider(), otel.GetLoggerProvider()
	t.Cleanup(func() { otel.SetTracerProvider(tp); otel.SetMeterProvider(mp); otel.SetLoggerProvider(lp) })

	shutdown, err := Setup(context.Background(), "api", "staging", "abc")
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if otel.GetTracerProvider() == tp || otel.GetMeterProvider() == mp || otel.GetLoggerProvider() == lp {
		t.Fatal("Setup left a global provider in place")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = shutdown(ctx) // flushing to a closed port may fail; it must return
}

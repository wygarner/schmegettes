// Package telemetry installs the OpenTelemetry tracer, meter and logger providers every Go
// service uses. It exports over OTLP/HTTP only when OTEL_EXPORTER_OTLP_ENDPOINT is set; the
// exporters read the endpoint and OTEL_EXPORTER_OTLP_HEADERS from the environment themselves.
// Without an endpoint (local dev, tests) the global providers stay no-ops and nothing fails.
// Conventions: docs/system-docs/operations/observability.md.
package telemetry

import (
	"context"
	"errors"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// EndpointEnv names the variable that turns export on.
const EndpointEnv = "OTEL_EXPORTER_OTLP_ENDPOINT"

// Enabled reports whether an OTLP endpoint is configured.
func Enabled() bool { return os.Getenv(EndpointEnv) != "" }

// Resource describes the service on every signal. env is "staging", "production" or "local".
func Resource(service, env, version string) *resource.Resource {
	return resource.NewSchemaless(
		attribute.String("service.name", service),
		attribute.String("service.version", version),
		attribute.String("deployment.environment", env),
		attribute.String("deployment.environment.name", env),
	)
}

// Setup installs the global providers and returns a shutdown that flushes them. With no
// endpoint configured it installs nothing and the shutdown is a no-op.
func Setup(ctx context.Context, service, env, version string) (func(context.Context) error, error) {
	noop := func(context.Context) error { return nil }
	if !Enabled() {
		return noop, nil
	}
	res := Resource(service, env, version)

	traceExp, err := otlptracehttp.New(ctx)
	if err != nil {
		return noop, err
	}
	metricExp, err := otlpmetrichttp.New(ctx)
	if err != nil {
		return noop, err
	}
	logExp, err := otlploghttp.New(ctx)
	if err != nil {
		return noop, err
	}

	tp := sdktrace.NewTracerProvider(sdktrace.WithResource(res), sdktrace.WithBatcher(traceExp))
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithResource(res), sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp)))
	lp := sdklog.NewLoggerProvider(sdklog.WithResource(res), sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)))

	otel.SetTracerProvider(tp)
	otel.SetMeterProvider(mp)
	otel.SetLoggerProvider(lp)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	return func(ctx context.Context) error {
		return errors.Join(tp.Shutdown(ctx), mp.Shutdown(ctx), lp.Shutdown(ctx))
	}, nil
}

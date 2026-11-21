package db

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func TestAuditFailureNoticeLogsError(t *testing.T) {
	buf := captureLogs(t)
	logNotice(&pgconn.Notice{Severity: "WARNING", Code: "01000",
		Message: "audit write failed: action=host_access_granted sqlstate=23514 request_id=abc123"})

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("one JSON line: %v (%q)", err, buf.String())
	}
	want := map[string]any{"level": "ERROR", "msg": "audit write failed", "action": "host_access_granted",
		"sqlstate": "23514", "request_id": "abc123"}
	for k, v := range want {
		if line[k] != v {
			t.Errorf("%s = %v, want %v", k, line[k], v)
		}
	}
}

func TestAuditFailureWithoutRequestID(t *testing.T) {
	buf := captureLogs(t)
	logNotice(&pgconn.Notice{Severity: "WARNING", Message: "audit write failed: action=staff_read sqlstate=42501 request_id=-"})
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatal(err)
	}
	if line["request_id"] != "" || line["level"] != "ERROR" {
		t.Errorf("got %v", line)
	}
}

func TestOtherNoticesAreDebugWithoutTheMessage(t *testing.T) {
	buf := captureLogs(t)
	logNotice(&pgconn.Notice{Severity: "NOTICE", Code: "00000", Message: "relation exists, skipping secret"})
	logNotice(&pgconn.Notice{Severity: "WARNING", Code: "01000", Message: "something else"})
	for _, raw := range bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
		var line map[string]any
		if err := json.Unmarshal(raw, &line); err != nil {
			t.Fatal(err)
		}
		if line["level"] != "DEBUG" {
			t.Errorf("level %v, want DEBUG", line["level"])
		}
		if bytes.Contains(raw, []byte("secret")) || bytes.Contains(raw, []byte("something else")) {
			t.Errorf("notice message logged: %s", raw)
		}
	}
}

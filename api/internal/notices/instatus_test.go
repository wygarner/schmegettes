package notices

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestInstatusOpenSendsOnlyNoticeData(t *testing.T) {
	start := time.Date(2026, 11, 28, 2, 0, 0, 0, time.UTC)
	end := start.Add(30 * time.Minute)
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/page-1/maintenances" || r.Method != http.MethodPost {
			t.Errorf("%s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("authorization = %q", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"maintenance-1"}`))
	}))
	defer server.Close()
	client := &InstatusClient{BaseURL: server.URL, Token: "secret", PageID: "page-1", HTTP: server.Client()}
	ref, err := client.Open(context.Background(), Notice{Kind: "maintenance", Title: "Upgrade", Body: "Brief downtime", StartsAt: &start, EndsAt: &end})
	if err != nil || ref != "maintenance-1" {
		t.Fatalf("open: %q %v", ref, err)
	}
	for _, forbidden := range []string{"userId", "email", "roomId", "createdBy", "id"} {
		if _, ok := got[forbidden]; ok {
			t.Errorf("provider body contains player field %q", forbidden)
		}
	}
	if got["name"] != "Upgrade" || got["message"] != "Brief downtime" || got["status"] != "NOTSTARTEDYET" {
		t.Errorf("body = %#v", got)
	}
}

func TestInstatusResolveUsesIncidentUpdate(t *testing.T) {
	resolution := "Fixed"
	ref := "incident-1"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/page-1/incidents/incident-1/incident-updates" {
			t.Errorf("path = %s", r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["status"] != "RESOLVED" || body["message"] != "Fixed" {
			t.Errorf("body = %#v", body)
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	client := &InstatusClient{BaseURL: server.URL, Token: "secret", PageID: "page-1", HTTP: server.Client()}
	if err := client.Resolve(context.Background(), Notice{Kind: "incident", StatusPageRef: &ref, Resolution: &resolution}); err != nil {
		t.Fatal(err)
	}
}

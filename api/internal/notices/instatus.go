package notices

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// InstatusClient implements the documented Instatus incident and maintenance APIs.
type InstatusClient struct {
	BaseURL, Token, PageID string
	HTTP                   *http.Client
}

func NewInstatus(token, pageID string) StatusPage {
	if token == "" || pageID == "" {
		return NoopStatusPage{}
	}
	return &InstatusClient{BaseURL: "https://api.instatus.com", Token: token, PageID: pageID, HTTP: http.DefaultClient}
}

func (c *InstatusClient) endpoint(kind, ref, suffix string) string {
	resource := "incidents"
	if kind == "maintenance" {
		resource = "maintenances"
	}
	p := "/v1/" + url.PathEscape(c.PageID) + "/" + resource
	if ref != "" {
		p += "/" + url.PathEscape(ref)
	}
	return strings.TrimRight(c.BaseURL, "/") + p + suffix
}

func providerBody(n Notice) map[string]any {
	body := map[string]any{"name": n.Title, "message": n.Body, "notify": false}
	if n.Kind == "incident" {
		body["status"] = "INVESTIGATING"
	} else if n.Kind == "maintenance" {
		body["status"] = "NOTSTARTEDYET"
		body["autoStart"], body["autoEnd"] = true, true
		if n.StartsAt != nil {
			body["start"] = n.StartsAt.UTC().Format("2006-01-02 15:04:05.000")
		}
		if n.EndsAt != nil {
			body["end"] = n.EndsAt.UTC().Format("2006-01-02 15:04:05.000")
		}
	}
	return body
}

func (c *InstatusClient) request(ctx context.Context, method, target string, body map[string]any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, res.Body)
		return fmt.Errorf("instatus returned %d", res.StatusCode)
	}
	if out != nil && res.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			return fmt.Errorf("decode instatus response: %w", err)
		}
	}
	return nil
}

func (c *InstatusClient) Open(ctx context.Context, n Notice) (string, error) {
	var response struct {
		ID string `json:"id"`
	}
	if err := c.request(ctx, http.MethodPost, c.endpoint(n.Kind, "", ""), providerBody(n), &response); err != nil {
		return "", err
	}
	if response.ID == "" {
		return "", fmt.Errorf("instatus response missing id")
	}
	return response.ID, nil
}

func (c *InstatusClient) Update(ctx context.Context, n Notice) error {
	if n.StatusPageRef == nil || *n.StatusPageRef == "" {
		return fmt.Errorf("status page reference missing")
	}
	return c.request(ctx, http.MethodPut, c.endpoint(n.Kind, *n.StatusPageRef, ""), providerBody(n), nil)
}

func (c *InstatusClient) Resolve(ctx context.Context, n Notice) error {
	if n.StatusPageRef == nil || *n.StatusPageRef == "" {
		return fmt.Errorf("status page reference missing")
	}
	message := "Resolved"
	if n.Resolution != nil {
		message = *n.Resolution
	}
	body := map[string]any{"message": message, "status": "RESOLVED", "notify": false}
	return c.request(ctx, http.MethodPost,
		c.endpoint("incident", *n.StatusPageRef, "/incident-updates"), body, nil)
}

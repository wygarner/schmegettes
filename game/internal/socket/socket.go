// Package socket upgrades /rooms/{roomID}/ws connections and pumps messages between a
// WebSocket and its room. The token arrives as the subprotocol "bearer.{jwt}", because
// browsers can't set headers on a WebSocket; it is never echoed back or logged.
package socket

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"schmegettes/game/internal/room"
	"schmegettes/golib/auth"
	"schmegettes/golib/db"
)

var (
	tracer = otel.Tracer("schmegettes/game/socket")
	// connected is the number of open sockets on this instance (a gauge in Grafana).
	connected, _ = otel.Meter("schmegettes/game/socket").Int64UpDownCounter("schmegettes.sockets.connected",
		metric.WithDescription("Open game sockets on this instance"))
)

// Protocol is the only subprotocol the server accepts back.
const Protocol = "schmegettes.v1"

// Verifier checks an access token. *auth.Verifier implements it.
type Verifier interface {
	Verify(token string) (auth.Claims, error)
}

// Membership answers whether the caller belongs to a room, as the caller (RLS).
type Membership interface {
	IsMember(ctx context.Context, c auth.Claims, roomID string) (bool, error)
}

// PGMembership checks membership with public.is_room_member as the user.
type PGMembership struct {
	DB *db.DB
}

// IsMember reports whether the caller is in the room.
func (m PGMembership) IsMember(ctx context.Context, c auth.Claims, roomID string) (bool, error) {
	var ok bool
	err := m.DB.AsUser(ctx, c, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, "select public.is_room_member($1::uuid)", roomID).Scan(&ok)
	})
	return ok, err
}

// Handler serves GET /rooms/{roomID}/ws.
type Handler struct {
	Verifier Verifier
	Members  Membership
	Hub      *room.Hub
	// Origins are the allowed browser origins (ALLOWED_ORIGINS), as full URLs.
	Origins []string
}

// bearer finds the token among the offered subprotocols and checks Protocol is offered too.
func bearer(r *http.Request) (string, bool) {
	var token string
	versioned := false
	for _, header := range r.Header.Values("Sec-WebSocket-Protocol") {
		for _, p := range strings.Split(header, ",") {
			p = strings.TrimSpace(p)
			if t, ok := strings.CutPrefix(p, "bearer."); ok {
				token = t
			} else if p == Protocol {
				versioned = true
			}
		}
	}
	return token, versioned && token != ""
}

func originHosts(origins []string) []string {
	var hosts []string
	for _, o := range origins {
		if u, err := url.Parse(strings.TrimSpace(o)); err == nil && u.Host != "" {
			hosts = append(hosts, u.Host)
		}
	}
	return hosts
}

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomID")
	if _, err := uuid.Parse(roomID); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	token, ok := bearer(r)
	if !ok {
		slog.Debug("socket rejected", "room_id", roomID, "reason", "no token or protocol")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	claims, err := h.Verifier.Verify(token)
	if err != nil {
		slog.Warn("socket rejected", "room_id", roomID, "reason", "bad token", "err", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	member, err := h.Members.IsMember(r.Context(), claims, roomID)
	if err != nil {
		slog.Error("membership check failed", "err", err, "room_id", roomID, "user_id", claims.UserID)
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}
	if !member {
		slog.Debug("socket rejected", "room_id", roomID, "user_id", claims.UserID, "reason", "not a member")
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols:   []string{Protocol},
		OriginPatterns: originHosts(h.Origins),
	})
	if err != nil {
		slog.Debug("socket upgrade failed", "err", err, "room_id", roomID)
		return
	}
	conn.SetReadLimit(4 << 10)

	// One span per socket session; the room's store calls for this socket are its children.
	_, span := tracer.Start(r.Context(), "socket.session", trace.WithAttributes(attribute.String("room_id", roomID)))
	connected.Add(context.Background(), 1)
	client := room.NewClient(claims.UserID)
	client.Trace = span.SpanContext()
	defer func() {
		role := "player"
		if client.IsHost() {
			role = "host"
		}
		span.SetAttributes(attribute.String("role", role))
		span.End()
		connected.Add(context.Background(), -1)
	}()
	rm := h.Hub.Attach(roomID, client)
	go write(conn, client)

	for {
		_, data, err := conn.Read(r.Context())
		if err != nil {
			rm.Detach(client)
			return
		}
		rm.Intent(client, data)
	}
}

// write sends the room's messages until the room releases the client, then closes the socket
// after flushing what was already queued (a room_closed, for example).
func write(conn *websocket.Conn, c *room.Client) {
	send := func(data []byte) bool {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return conn.Write(ctx, websocket.MessageText, data) == nil
	}
	for {
		select {
		case data := <-c.Out:
			if !send(data) {
				_ = conn.CloseNow()
				return
			}
		case <-c.Done:
			for {
				select {
				case data := <-c.Out:
					if !send(data) {
						_ = conn.CloseNow()
						return
					}
				default:
					code, reason := websocket.StatusNormalClosure, ""
					switch c.CloseCode {
					case room.CloseOtherDevice:
						code, reason = websocket.StatusCode(room.CloseOtherDevice), "other_device"
					case room.CloseRoomCrashed:
						code, reason = websocket.StatusInternalError, "room_crashed"
					}
					err := conn.Close(code, reason)
					if err != nil && !errors.Is(err, context.Canceled) {
						_ = conn.CloseNow()
					}
					return
				}
			}
		}
	}
}

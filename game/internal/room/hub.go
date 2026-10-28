package room

import (
	"context"
	"sync"
)

// Hub holds the rooms this instance is running.
type Hub struct {
	ctx   context.Context
	store Store
	cfg   Config

	mu    sync.Mutex
	rooms map[string]*Room
}

// NewHub makes a hub whose rooms stop when ctx ends.
func NewHub(ctx context.Context, store Store, cfg Config) *Hub {
	return &Hub{ctx: ctx, store: store, cfg: cfg, rooms: map[string]*Room{}}
}

// Attach connects a client to a room, starting the room if it isn't running. If the room
// can't be served (closed or missing), the client's Done closes.
func (h *Hub) Attach(roomID string, c *Client) *Room {
	for {
		h.mu.Lock()
		r, ok := h.rooms[roomID]
		if !ok {
			r = newRoom(roomID, h.store, h.cfg)
			h.rooms[roomID] = r
			h.mu.Unlock()
			go r.run(h.ctx, c, func() {
				h.mu.Lock()
				if h.rooms[roomID] == r {
					delete(h.rooms, roomID)
				}
				h.mu.Unlock()
			})
			return r
		}
		h.mu.Unlock()
		if r.send(event{kind: evAttach, client: c}) {
			return r
		}
		// The room stopped between lookup and send; it has left the map, so start a fresh one.
	}
}

// Running reports how many rooms are live (for tests and health).
func (h *Hub) Running() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms)
}

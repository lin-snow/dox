package server

import "sync"

// Event is one frame pushed to the UI over SSE.
type Event struct {
	Type   string `json:"type"`
	TodoID string `json:"todoId,omitempty"`
	Title  string `json:"title,omitempty"`
}

// Hub fans events out to every connected UI. Publishing never blocks: a
// window that stopped reading must not be able to stall the tray or the
// reminder poller.
type Hub struct {
	mu   sync.Mutex
	subs map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[chan Event]struct{})}
}

func (h *Hub) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		delete(h.subs, ch)
		h.mu.Unlock()
	}
}

func (h *Hub) Publish(event Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- event:
		default:
		}
	}
}

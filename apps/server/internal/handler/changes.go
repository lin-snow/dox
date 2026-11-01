package handler

import (
	"context"
	"sync"
)

// Changes is the server's monotonic mutation counter, used by WatchChanges to
// tell long-polling clients that something they might render has changed.
//
// Why a counter and not a stream of events: the gateway is plain HTTP/JSON and
// the write path already publishes typed messages on the bus for in-process
// subscribers. Clients only need to know *that* something changed — they
// refetch through the same endpoints (and the same visibility rules) they
// already use. One integer keeps the contract tiny and impossible to desync.
//
// It is bumped by middleware after a successful non-GET under /v1, which is the
// only point where the HTTP surface proves a write committed. Bumping inside the
// request handler would risk waking waiters before the transaction commits.
type Changes struct {
	mu     sync.Mutex
	ver    uint64
	notify chan struct{}
}

// NewChanges returns a counter at version 0 with no waiters.
func NewChanges() *Changes {
	return &Changes{notify: make(chan struct{})}
}

// Current reads the version without blocking.
func (c *Changes) Current() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ver
}

// Bump advances the version and releases every waiter.
func (c *Changes) Bump() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ver++
	// Closing the generation channel releases all waiters at once; the next
	// wait allocates a fresh one, so a bump is never lost between check and
	// wait.
	close(c.notify)
	c.notify = make(chan struct{})
}

// Wait blocks until the version differs from `since` or ctx is done, then
// returns the version observed. A cancelled context returns the current
// version, which the caller reports back so an aborted poll never looks like a
// change.
func (c *Changes) Wait(ctx context.Context, since uint64) uint64 {
	for {
		c.mu.Lock()
		if c.ver != since {
			ver := c.ver
			c.mu.Unlock()
			return ver
		}
		notify := c.notify
		c.mu.Unlock()

		select {
		case <-ctx.Done():
			return c.Current()
		case <-notify:
		}
	}
}

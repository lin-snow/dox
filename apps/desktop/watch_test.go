package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

// The fake server answers instantly, so it also sleeps a little: the real one
// holds the request open, and without the delay this test would spin.
func newVersionServer(version *atomic.Int64, calls *atomic.Int64) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		time.Sleep(5 * time.Millisecond)
		_, _ = w.Write([]byte(`{"version":"` + strconv.FormatInt(version.Load(), 10) + `"}`))
	}))
}

func TestWatchChangesFiresOncePerVersion(t *testing.T) {
	var version, calls atomic.Int64
	server := newVersionServer(&version, &calls)
	defer server.Close()

	changed := make(chan struct{}, 8)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchChanges(ctx, func() bool { return true }, changeSource{
		Client: server.Client(),
		Base:   func() string { return server.URL },
		Token:  func() string { return "tok" },
	}, func() { changed <- struct{}{} })

	// Bootstrap: version 0 equals `since`, so an idle server says nothing.
	select {
	case <-changed:
		t.Fatal("fired without a change")
	case <-time.After(60 * time.Millisecond):
	}

	version.Store(1)
	select {
	case <-changed:
	case <-time.After(time.Second):
		t.Fatal("no event after the counter moved")
	}

	// Same version again is not a change, however many times it is polled.
	select {
	case <-changed:
		t.Fatal("fired twice for one change")
	case <-time.After(80 * time.Millisecond):
	}
}

func TestWatchChangesSkipsPollsWhileDisabled(t *testing.T) {
	var version, calls atomic.Int64
	server := newVersionServer(&version, &calls)
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchChanges(ctx, func() bool { return false }, changeSource{
		Client: server.Client(),
		Base:   func() string { return server.URL },
		Token:  func() string { return "" },
	}, func() {})

	time.Sleep(80 * time.Millisecond)
	if n := calls.Load(); n != 0 {
		t.Fatalf("polled %d times while disabled", n)
	}
}

func TestWatchChangesWithoutServerDoesNotSpin(t *testing.T) {
	var calls atomic.Int64
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go watchChanges(ctx, func() bool { return true }, changeSource{
		Client: http.DefaultClient,
		Base:   func() string { return "" },
		Token:  func() string { return "" },
	}, func() { calls.Add(1) })

	time.Sleep(80 * time.Millisecond)
	if calls.Load() != 0 {
		t.Fatal("announced a change without a server")
	}
}

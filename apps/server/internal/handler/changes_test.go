package handler_test

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	doxv1 "github.com/lin-snow/dox/apps/server/gen/dox/v1"
	"github.com/lin-snow/dox/apps/server/internal/handler"
)

func TestChanges_WaitReturnsImmediatelyWhenVersionDiffers(t *testing.T) {
	ch := handler.NewChanges()
	ch.Bump()
	ch.Bump()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if got := ch.Wait(ctx, 0); got != 2 {
		t.Fatalf("version = %d, want 2", got)
	}
	if elapsed := time.Since(start); elapsed > 20*time.Millisecond {
		t.Fatalf("waited %v for an available version", elapsed)
	}
}

func TestChanges_WaitReleasesOnBump(t *testing.T) {
	ch := handler.NewChanges()
	done := make(chan uint64, 1)

	go func() { done <- ch.Wait(context.Background(), ch.Current()) }()

	// Give the waiter a moment to park; a lost wakeup would hang the test.
	time.Sleep(10 * time.Millisecond)
	ch.Bump()

	select {
	case ver := <-done:
		if ver != 1 {
			t.Fatalf("version = %d, want 1", ver)
		}
	case <-time.After(time.Second):
		t.Fatal("Bump did not release the waiter")
	}
}

func TestChanges_WaitOnTimeoutReportsNoChange(t *testing.T) {
	ch := handler.NewChanges()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	// A timeout must not look like a change: the caller compares the returned
	// version with what it asked for.
	if got := ch.Wait(ctx, 7); got != 0 {
		t.Fatalf("version = %d, want the current (0)", got)
	}
}

func TestWatchChanges_ReturnsWhenAWriteBumps(t *testing.T) {
	f := newEventFixture(t)
	ch := handler.NewChanges()
	ev := handler.NewEvent(f.q, ch)

	go func() {
		time.Sleep(10 * time.Millisecond)
		if _, err := f.todo.CreateTodo(f.ctx, &doxv1.CreateTodoRequest{Title: "written elsewhere"}); err != nil {
			t.Errorf("CreateTodo: %v", err)
		}
		ch.Bump()
	}()

	start := time.Now()
	res, err := ev.WatchChanges(f.ctx, &doxv1.WatchChangesRequest{Since: 0, TimeoutMs: 2000})
	if err != nil {
		t.Fatalf("WatchChanges: %v", err)
	}
	if res.GetVersion() != 1 {
		t.Fatalf("version = %d, want 1", res.GetVersion())
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("waited %v", elapsed)
	}
}

func TestWatchChanges_HonoursTimeoutAndClamps(t *testing.T) {
	f := newEventFixture(t)
	ch := handler.NewChanges()
	ev := handler.NewEvent(f.q, ch)

	start := time.Now()
	res, err := ev.WatchChanges(f.ctx, &doxv1.WatchChangesRequest{Since: 0, TimeoutMs: 120})
	if err != nil {
		t.Fatalf("WatchChanges: %v", err)
	}
	if res.GetVersion() != 0 {
		t.Fatalf("version = %d, want 0 (no change)", res.GetVersion())
	}
	if elapsed := time.Since(start); elapsed < 100*time.Millisecond {
		t.Fatalf("returned after %v, before the timeout floor", elapsed)
	}

	// A cancelled request must not surface as an RPC error: the client is
	// reconnecting, and a 5xx would look like a server fault.
	ctx, cancel := context.WithCancel(f.ctx)
	cancel()
	if _, err := ev.WatchChanges(ctx, &doxv1.WatchChangesRequest{Since: 0, TimeoutMs: 5000}); status.Code(err) != codes.OK {
		t.Fatalf("cancelled watch: %v", err)
	}
}

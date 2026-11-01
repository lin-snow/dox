package feed_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/lin-snow/dox/apps/desktop/internal/feed"
)

type recorder struct {
	mu        sync.Mutex
	notified  []string
	unread    int
	unreadHit int
}

func (r *recorder) Notify(reminder feed.Reminder) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.notified = append(r.notified, reminder.ID)
}

func (r *recorder) Unread(count int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.unread = count
	r.unreadHit++
}

func (r *recorder) snapshot() ([]string, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.notified...), r.unread
}

type source struct {
	mu        sync.Mutex
	reminders []feed.Reminder
	unread    int
	err       error
	calls     int
}

func (s *source) Unread(context.Context) ([]feed.Reminder, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	if s.err != nil {
		return nil, 0, s.err
	}
	return s.reminders, s.unread, nil
}

func (s *source) set(reminders []feed.Reminder, unread int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reminders = reminders
	s.unread = unread
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition never became true")
}

func TestRunAnnouncesEachReminderOnce(t *testing.T) {
	src := &source{}
	src.set([]feed.Reminder{{ID: "r1", TodoID: "t1"}}, 1)
	sink := &recorder{}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go feed.Run(ctx, src, sink, feed.Config{
		Interval: 10 * time.Millisecond,
		Enabled:  func() bool { return true },
	})

	waitFor(t, func() bool {
		notified, _ := sink.snapshot()
		return len(notified) == 1
	})

	// Same row keeps coming back from the ledger; it must not notify again.
	time.Sleep(60 * time.Millisecond)
	notified, unread := sink.snapshot()
	if len(notified) != 1 {
		t.Fatalf("notified %v, want exactly one announcement", notified)
	}
	if unread != 1 {
		t.Errorf("unread = %d, want 1", unread)
	}
}

func TestRunSkipsPollsWhenDisabled(t *testing.T) {
	src := &source{}
	sink := &recorder{}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go feed.Run(ctx, src, sink, feed.Config{
		Interval: 10 * time.Millisecond,
		Enabled:  func() bool { return false },
	})

	time.Sleep(60 * time.Millisecond)
	if notified, _ := sink.snapshot(); len(notified) != 0 {
		t.Fatalf("notified %v while disabled", notified)
	}
}

func TestRunSurvivesSourceErrors(t *testing.T) {
	src := &source{err: feed.ErrNoServer}
	sink := &recorder{}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go feed.Run(ctx, src, sink, feed.Config{
		Interval: 5 * time.Millisecond,
		Enabled:  func() bool { return true },
	})

	time.Sleep(40 * time.Millisecond)
	src.mu.Lock()
	src.err = nil
	src.reminders = []feed.Reminder{{ID: "late"}}
	src.mu.Unlock()

	waitFor(t, func() bool {
		notified, _ := sink.snapshot()
		return len(notified) == 1
	})
}

func TestHTTPSourceReadsLedger(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Query().Get("unread_only") != "true" {
			t.Errorf("unread_only missing: %s", r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"notifications": []map[string]string{
				{"id": "n1", "todoId": "t1", "todoTitle": "write the report"},
			},
			"unreadCount": 3,
		})
	}))
	defer server.Close()

	src := feed.HTTPSource{
		Client: server.Client(),
		Base:   func() string { return server.URL },
		Token:  func() string { return "tok" },
	}
	reminders, unread, err := src.Unread(context.Background())
	if err != nil {
		t.Fatalf("Unread: %v", err)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("authorization = %q, want Bearer tok", gotAuth)
	}
	if len(reminders) != 1 || reminders[0].ID != "n1" || reminders[0].TodoTitle != "write the report" {
		t.Errorf("reminders = %+v", reminders)
	}
	if unread != 3 {
		t.Errorf("unread = %d, want 3", unread)
	}
}

func TestHTTPSourceWithoutServer(t *testing.T) {
	src := feed.HTTPSource{
		Client: http.DefaultClient,
		Base:   func() string { return "" },
		Token:  func() string { return "" },
	}
	if _, _, err := src.Unread(context.Background()); err == nil {
		t.Fatal("want an error when no server is configured")
	}
}

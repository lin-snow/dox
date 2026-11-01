package notifier

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/lin-snow/dox/apps/server/internal/config"
)

// 2026-05-17T12:00:00Z, the instant the body assertion expects.
const ntfytestScheduled = int64(1779019200000)

type ntfyRequest struct {
	method        string
	escapedPath   string
	title         string
	tags          string
	authorization string
	body          string
}

// capture returns a handler that records the next publish and answers with
// status/body.
func capture(t *testing.T, status int, reply string) (*httptest.Server, func() ntfyRequest) {
	t.Helper()
	var mu sync.Mutex
	var got ntfyRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		got = ntfyRequest{
			method:        r.Method,
			escapedPath:   r.URL.EscapedPath(),
			title:         r.Header.Get("Title"),
			tags:          r.Header.Get("Tags"),
			authorization: r.Header.Get("Authorization"),
			body:          string(body),
		}
		mu.Unlock()
		w.WriteHeader(status)
		_, _ = io.WriteString(w, reply)
	}))
	t.Cleanup(srv.Close)
	return srv, func() ntfyRequest {
		mu.Lock()
		defer mu.Unlock()
		return got
	}
}

func TestNtfyDeliver_publishesReminder(t *testing.T) {
	cases := []struct {
		name     string
		topic    string
		token    string
		userID   string
		wantPath string
		wantAuth string
	}{
		{
			name:     "shared topic without token",
			topic:    "dox-alerts",
			userID:   "01HX0000000000000000000001",
			wantPath: "/dox-alerts",
		},
		{
			name:     "token becomes a bearer header",
			topic:    "dox-alerts",
			token:    "tk_123",
			userID:   "01HX0000000000000000000001",
			wantPath: "/dox-alerts",
			wantAuth: "Bearer tk_123",
		},
		{
			// A separator or space in the id must not split the topic into
			// extra segments, or the publish would hit a different topic.
			name:     "user template stays a single segment",
			topic:    "dox-{user}",
			userID:   "a/b c",
			wantPath: "/dox-a%2Fb%20c",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, last := capture(t, http.StatusOK, "")
			// Trailing slash on purpose: the deliverer owns the join.
			d := NewNtfy(NtfyConfig{
				BaseURL: srv.URL + "/",
				Topic:   tc.topic,
				Token:   tc.token,
				Client:  srv.Client(),
			})
			n := Notification{
				UserID:       tc.userID,
				TodoTitle:    "ship it",
				Kind:         KindDue,
				ScheduledFor: ntfytestScheduled,
			}
			if err := d.Deliver(context.Background(), n); err != nil {
				t.Fatalf("Deliver: %v", err)
			}

			got := last()
			if got.method != http.MethodPost {
				t.Errorf("method = %q, want POST", got.method)
			}
			if got.escapedPath != tc.wantPath {
				t.Errorf("path = %q, want %q", got.escapedPath, tc.wantPath)
			}
			if strings.Count(got.escapedPath, "/") != 1 {
				t.Errorf("path %q is not a single segment", got.escapedPath)
			}
			if got.title != "ship it" {
				t.Errorf("Title = %q, want %q", got.title, "ship it")
			}
			if got.tags != "dox,reminder" {
				t.Errorf("Tags = %q, want %q", got.tags, "dox,reminder")
			}
			if want := "Scheduled 2026-05-17T12:00:00Z"; got.body != want {
				t.Errorf("body = %q, want %q", got.body, want)
			}
			if got.authorization != tc.wantAuth {
				t.Errorf("Authorization = %q, want %q", got.authorization, tc.wantAuth)
			}
		})
	}
}

func TestNtfyDeliver_non2xxCarriesServerBody(t *testing.T) {
	srv, _ := capture(t, http.StatusForbidden, "topic not allowed\n")
	d := NewNtfy(NtfyConfig{BaseURL: srv.URL, Topic: "dox", Client: srv.Client()})

	err := d.Deliver(context.Background(), Notification{UserID: "u1", TodoTitle: "x"})
	if err == nil {
		t.Fatal("Deliver succeeded, want error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "ntfy: topic not allowed") {
		t.Errorf("error = %q, want server body", msg)
	}
	if strings.Contains(msg, "\n") {
		t.Errorf("error = %q, want trimmed body", msg)
	}
}

// The DOX_NTFY_* mapping is asserted here, next to the deliverer that consumes
// it, so config and transport cannot drift apart without a test failing.
func TestConfigLoad_ntfy(t *testing.T) {
	t.Setenv("DOX_NTFY_URL", "https://push.example.com/")
	t.Setenv("DOX_NTFY_TOPIC", "dox-alerts")
	t.Setenv("DOX_NTFY_TOKEN", "secret")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.NtfyURL != "https://push.example.com" {
		t.Errorf("NtfyURL = %q, want trailing slash trimmed", cfg.NtfyURL)
	}
	if cfg.NtfyTopic != "dox-alerts" {
		t.Errorf("NtfyTopic = %q, want %q", cfg.NtfyTopic, "dox-alerts")
	}
	if cfg.NtfyToken != "secret" {
		t.Errorf("NtfyToken = %q, want %q", cfg.NtfyToken, "secret")
	}
}

func TestConfigLoad_ntfyDefaults(t *testing.T) {
	// An unset topic must stay unset: enabling a third-party push by default
	// would leak titles off the box.
	t.Setenv("DOX_NTFY_URL", "")
	t.Setenv("DOX_NTFY_TOPIC", "")
	t.Setenv("DOX_NTFY_TOKEN", "")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.NtfyURL != "https://ntfy.sh" {
		t.Errorf("NtfyURL = %q, want default", cfg.NtfyURL)
	}
	if cfg.NtfyTopic != "" {
		t.Errorf("NtfyTopic = %q, want empty", cfg.NtfyTopic)
	}
	if cfg.NtfyToken != "" {
		t.Errorf("NtfyToken = %q, want empty", cfg.NtfyToken)
	}
}

package notifier

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ntfyMaxBody caps how much of a failed response is echoed in the error. ntfy
// answers with a short plain-text reason; anything longer is a proxy page and
// belongs in the log, not in a one-line message.
const ntfyMaxBody = 200

// ntfyTimeout bounds one publish when the caller supplies no client. A publish
// is best effort by design: the ledger row is already written, so waiting on a
// slow relay only delays the next tick.
const ntfyTimeout = 10 * time.Second

// NtfyConfig points the deliverer at an ntfy server.
type NtfyConfig struct {
	// BaseURL is the server root, e.g. "https://ntfy.sh"; a trailing slash is
	// tolerated.
	BaseURL string
	// Topic is the publish topic and may contain the literal "{user}", which
	// is replaced with the notification's recipient. That covers both shapes a
	// deployment can want: a shared broadcast topic, or "dox-{user}" so each
	// person subscribes to their own.
	Topic string
	// Token is an optional bearer token for a protected instance.
	Token string
	// Client is injectable for tests; nil uses a 10s-timeout client.
	Client *http.Client
}

// NewNtfy returns a Deliverer that publishes each reminder to ntfy. Calling it
// with an empty Topic is a deployment bug, not a disabled channel: app.Run
// only constructs it when the topic is set.
func NewNtfy(cfg NtfyConfig) Deliverer {
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: ntfyTimeout}
	}
	return &ntfyDeliverer{cfg: cfg, client: client}
}

type ntfyDeliverer struct {
	cfg    NtfyConfig
	client *http.Client
}

// Deliver publishes one reminder. Body carries the trigger instant because a
// human reading the push already knows the title; "due · todo <id>" would only
// repeat machine identifiers.
//
// No retry: the notification row is the durable record clients poll, so a
// failed push loses a convenience, not data — and retrying would re-notify on
// top of whatever the next sweep legitimately finds.
func (d *ntfyDeliverer) Deliver(ctx context.Context, n Notification) error {
	// Substitution before escaping, so the substituted value cannot introduce
	// a path separator: PathEscape keeps the whole topic inside one segment.
	topic := url.PathEscape(strings.ReplaceAll(d.cfg.Topic, "{user}", n.UserID))
	endpoint := strings.TrimRight(d.cfg.BaseURL, "/") + "/" + topic

	body := "Scheduled " + time.UnixMilli(n.ScheduledFor).UTC().Format(time.RFC3339)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(body))
	if err != nil {
		return fmt.Errorf("ntfy: %w", err)
	}
	req.Header.Set("Title", n.TodoTitle)
	req.Header.Set("Tags", "dox,reminder")
	req.Header.Set("Content-Type", "text/plain; charset=utf-8")
	if d.cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+d.cfg.Token)
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, ntfyMaxBody))
		reason := strings.TrimSpace(string(msg))
		if reason == "" {
			reason = resp.Status
		}
		return fmt.Errorf("ntfy: %s", reason)
	}
	// Drain so the connection can be reused; the snapshot is empty for a no-content reply.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<10))
	return nil
}

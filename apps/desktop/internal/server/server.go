// Package server is the desktop app's only HTTP surface.
//
// Everything the UI needs is a same-origin request: `/v1/...` is proxied to the
// dox server, `/__dox/...` is the desktop control plane (session, prefs,
// events), and `/` serves the built bundle. One transport means the whole app
// can be driven and verified in a plain browser via `dox-desktop -serve`,
// instead of only inside WKWebView.
package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/lin-snow/dox/apps/desktop/internal/store"
)

// Options are the app's wiring; every field is required except Now and Unread.
type Options struct {
	Store  *store.Store
	Proxy  http.Handler
	Assets fs.FS
	Hub    *Hub
	// Version is the desktop build version, surfaced to Settings.
	Version string
	// Unread reports the tray badge count from the reminder poller.
	Unread func() int
	Now    func() time.Time
}

type server struct {
	opts Options
}

func New(opts Options) http.Handler {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Hub == nil {
		opts.Hub = NewHub()
	}
	s := &server{opts: opts}

	mux := http.NewServeMux()
	mux.Handle("/v1/", opts.Proxy)
	mux.Handle("/healthz", opts.Proxy)
	mux.HandleFunc("GET /__dox/session", s.getSession)
	mux.HandleFunc("POST /__dox/session", s.signIn)
	mux.HandleFunc("DELETE /__dox/session", s.signOut)
	mux.HandleFunc("PUT /__dox/server", s.setServer)
	mux.HandleFunc("POST /__dox/register", s.register)
	mux.HandleFunc("GET /__dox/prefs", s.getPrefs)
	mux.HandleFunc("PUT /__dox/prefs", s.putPrefs)
	mux.HandleFunc("GET /__dox/events", s.events)
	mux.HandleFunc("GET /__dox/healthz", s.health)
	// Not method-qualified: a "GET /" pattern would be ambiguous against the
	// method-agnostic "/v1/" mount above. The handler checks the method itself.
	mux.Handle("/", s.static())
	return withHeaders(mux)
}

// ---- session -------------------------------------------------------------

type sessionUser struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type sessionResponse struct {
	Server      string       `json:"server"`
	SignedIn    bool         `json:"signedIn"`
	User        *sessionUser `json:"user"`
	Version     string       `json:"version"`
	UnreadCount int          `json:"unreadCount"`
}

func (s *server) session() sessionResponse {
	unread := 0
	if s.opts.Unread != nil {
		unread = s.opts.Unread()
	}

	response := sessionResponse{
		Server:      s.opts.Store.Server(),
		SignedIn:    s.opts.Store.SignedIn(),
		Version:     s.opts.Version,
		UnreadCount: unread,
	}
	if id, name, role := s.opts.Store.User(); name != "" {
		response.User = &sessionUser{ID: id, Name: name, Role: role}
	}
	return response
}

func (s *server) getSession(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.session())
}

type credentials struct {
	UserName string `json:"userName"`
	Password string `json:"password"`
}

type authResult struct {
	Token    string `json:"token"`
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	Role     string `json:"role"`
}

func (s *server) signIn(w http.ResponseWriter, r *http.Request) {
	var input credentials
	if !decode(w, r, &input) {
		return
	}
	raw, status, err := s.call(r.Context(), http.MethodPost, "/v1/auth/login", input)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if status != http.StatusOK {
		writeError(w, status, apiMessage(raw, status))
		return
	}

	var result authResult
	if err := json.Unmarshal(raw, &result); err != nil || result.Token == "" {
		writeError(w, http.StatusBadGateway, "malformed login response")
		return
	}
	s.finishSignIn(w, result)
}

type registerInput struct {
	UserName          string `json:"userName"`
	Password          string `json:"password"`
	InviteCode        string `json:"inviteCode,omitempty"`
	ServerName        string `json:"serverName,omitempty"`
	ServerDescription string `json:"serverDescription,omitempty"`
}

func (s *server) register(w http.ResponseWriter, r *http.Request) {
	var input registerInput
	if !decode(w, r, &input) {
		return
	}
	// Field names match the proto's JSON form; empty optionals are omitted so
	// the server keeps its own defaults.
	body := map[string]any{
		"userName": input.UserName,
		"password": input.Password,
	}
	if input.InviteCode != "" {
		body["inviteCode"] = input.InviteCode
	}
	if input.ServerName != "" {
		body["serverName"] = input.ServerName
	}
	if input.ServerDescription != "" {
		body["serverDescription"] = input.ServerDescription
	}

	raw, status, err := s.call(r.Context(), http.MethodPost, "/v1/auth/register", body)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if status != http.StatusOK {
		writeError(w, status, apiMessage(raw, status))
		return
	}

	var result authResult
	if err := json.Unmarshal(raw, &result); err != nil || result.Token == "" {
		writeError(w, http.StatusBadGateway, "malformed register response")
		return
	}
	s.finishSignIn(w, result)
}

func (s *server) finishSignIn(w http.ResponseWriter, result authResult) {
	if err := s.opts.Store.SignIn(result.UserID, result.UserName, result.Role, result.Token); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.opts.Hub.Publish(Event{Type: "session"})
	writeJSON(w, http.StatusOK, s.session())
}

func (s *server) signOut(w http.ResponseWriter, r *http.Request) {
	if err := s.opts.Store.SignOut(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.opts.Hub.Publish(Event{Type: "session"})
	writeJSON(w, http.StatusOK, s.session())
}

// ---- server selection ----------------------------------------------------

type probe struct {
	HasUsers          bool   `json:"hasUsers"`
	RegistrationOpen  bool   `json:"registrationOpen"`
	Version           string `json:"version"`
	Commit            string `json:"commit"`
	ServerName        string `json:"serverName"`
	ServerDescription string `json:"serverDescription"`
	OwnerName         string `json:"ownerName"`
}

type serverState struct {
	Session sessionResponse `json:"session"`
	Probe   probe           `json:"probe"`
}

func (s *server) setServer(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Server string `json:"server"`
	}
	if !decode(w, r, &input) {
		return
	}

	previous := s.opts.Store.Server()
	if err := s.opts.Store.SetServer(input.Server); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	info, err := s.probeServer(r.Context())
	if err != nil {
		// Do not leave the app pointed at an unreachable host.
		if previous != "" {
			_ = s.opts.Store.SetServer(previous)
		} else {
			_ = s.opts.Store.ClearServer()
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	s.opts.Hub.Publish(Event{Type: "session"})
	writeJSON(w, http.StatusOK, serverState{Session: s.session(), Probe: info})
}

func (s *server) probeServer(ctx context.Context) (probe, error) {
	raw, status, err := s.call(ctx, http.MethodGet, "/v1/auth/server-info", nil)
	if err != nil {
		return probe{}, err
	}
	if status != http.StatusOK {
		return probe{}, fmt.Errorf("%s", apiMessage(raw, status))
	}
	var info probe
	if err := json.Unmarshal(raw, &info); err != nil {
		return probe{}, fmt.Errorf("malformed server-info response: %w", err)
	}
	return info, nil
}

// ---- prefs ---------------------------------------------------------------

func (s *server) getPrefs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.opts.Store.Prefs())
}

func (s *server) putPrefs(w http.ResponseWriter, r *http.Request) {
	current := s.opts.Store.Prefs()
	if !decode(w, r, &current) {
		return
	}
	if err := s.opts.Store.SetPrefs(current); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.opts.Store.Prefs())
}

// ---- events --------------------------------------------------------------

func (s *server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	events, unsubscribe := s.opts.Hub.Subscribe()
	defer unsubscribe()

	// Comment frames keep intermediaries from idling the stream out; the
	// browser reconnects on its own if it drops.
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-events:
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			if _, err := io.WriteString(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// ---- static bundle -------------------------------------------------------

func (s *server) static() http.Handler {
	files := http.FileServerFS(s.opts.Assets)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		requested := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if requested == "" {
			files.ServeHTTP(w, r)
			return
		}
		if _, err := fs.Stat(s.opts.Assets, requested); err != nil {
			// Unknown path: hand back the app shell rather than a 404 page.
			shell := r.Clone(r.Context())
			shell.URL.Path = "/"
			files.ServeHTTP(w, shell)
			return
		}
		files.ServeHTTP(w, r)
	})
}

// ---- helpers -------------------------------------------------------------

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"version":  s.opts.Version,
		"server":   s.opts.Store.Server(),
		"signedIn": s.opts.Store.SignedIn(),
		"unread":   s.session().UnreadCount,
	})
}

// call issues a request through the same proxy the webview uses, so base-URL
// joining and token injection have exactly one implementation.
func (s *server) call(ctx context.Context, method, urlPath string, body any) ([]byte, int, error) {
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, urlPath, payload)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	rec := &recorder{}
	s.opts.Proxy.ServeHTTP(rec, req)
	return rec.body.Bytes(), rec.statusCode(), nil
}

type recorder struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (r *recorder) Header() http.Header {
	if r.header == nil {
		r.header = make(http.Header)
	}
	return r.header
}

func (r *recorder) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
}

func (r *recorder) Write(data []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.body.Write(data)
}

func (r *recorder) statusCode() int {
	if r.status == 0 {
		return http.StatusOK
	}
	return r.status
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return false
	}
	if len(raw) == 0 {
		writeError(w, http.StatusBadRequest, "empty request body")
		return false
	}
	if err := json.Unmarshal(raw, target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func apiMessage(raw []byte, status int) string {
	var body struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &body) == nil && body.Message != "" {
		return body.Message
	}
	return fmt.Sprintf("The server returned an error (%d).", status)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Debug("write json", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

// withHeaders sets the headers that cost nothing and prevent whole classes of
// accident. The CSP is strict because the renderer holds no credential — the
// proxy injects the token — so the only thing to defend is accidental remote
// content in rendered markdown.
func withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy",
			"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data:; connect-src 'self'; base-uri 'none'; "+
				"form-action 'none'; frame-ancestors 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

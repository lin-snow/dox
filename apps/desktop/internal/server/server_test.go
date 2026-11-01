package server_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/lin-snow/dox/apps/desktop/internal/proxy"
	"github.com/lin-snow/dox/apps/desktop/internal/server"
	"github.com/lin-snow/dox/apps/desktop/internal/store"
)

// fakeServer stands in for a deployed dox server.
func fakeServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/auth/server-info", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"hasUsers":         true,
			"registrationOpen": false,
			"version":          "v1.2.3",
			"commit":           "abc123",
			"serverName":       "Alice Dox",
			"ownerName":        "alice",
		})
	})
	mux.HandleFunc("POST /v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UserName string `json:"userName"`
			Password string `json:"password"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.UserName != "alice" || body.Password != "secret" {
			writeJSONStatus(w, http.StatusUnauthorized, map[string]any{
				"code": 16, "message": "invalid username or password",
			})
			return
		}
		writeJSON(w, map[string]any{
			"token": "jwt-1", "userId": "u1", "userName": "alice", "role": "owner",
		})
	})
	mux.HandleFunc("GET /v1/todos", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer jwt-1" {
			writeJSONStatus(w, http.StatusUnauthorized, map[string]any{"code": 16})
			return
		}
		writeJSON(w, map[string]any{
			"todos": []map[string]any{{
				"id": "t1", "title": "from upstream", "done": false,
				"createdAt": "1", "updatedAt": "1", "createdBy": "u1",
			}},
		})
	})
	return httptest.NewServer(mux)
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONStatus(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func newApp(t *testing.T) (http.Handler, *server.Hub) {
	t.Helper()
	state, err := store.OpenWith(t.TempDir(), store.NewMemoryKeyring())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	hub := server.NewHub()
	handler := server.New(server.Options{
		Store:   state,
		Proxy:   proxy.New(proxy.Options{Base: state.Base, Token: state.Token}),
		Assets:  fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("<html>app shell</html>")}},
		Hub:     hub,
		Version: "test",
		Unread:  func() int { return 4 },
	})
	return handler, hub
}

func request(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestSessionStartsSignedOut(t *testing.T) {
	handler, _ := newApp(t)
	rec := request(t, handler, http.MethodGet, "/__dox/session", "")

	var body struct {
		Server      string `json:"server"`
		SignedIn    bool   `json:"signedIn"`
		Version     string `json:"version"`
		UnreadCount int    `json:"unreadCount"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v (%s)", err, rec.Body.String())
	}
	if body.SignedIn {
		t.Error("a fresh app must not be signed in")
	}
	if body.Server != "" {
		t.Errorf("server = %q, want empty", body.Server)
	}
	if body.Version != "test" {
		t.Errorf("version = %q, want test", body.Version)
	}
	if body.UnreadCount != 4 {
		t.Errorf("unread = %d, want the poller's count", body.UnreadCount)
	}
}

func TestSettingServerReturnsProbe(t *testing.T) {
	upstream := fakeServer(t)
	defer upstream.Close()

	handler, _ := newApp(t)
	rec := request(t, handler, http.MethodPut, "/__dox/server", `{"server":"`+upstream.URL+`"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Session struct {
			Server   string `json:"server"`
			SignedIn bool   `json:"signedIn"`
		} `json:"session"`
		Probe struct {
			ServerName       string `json:"serverName"`
			HasUsers         bool   `json:"hasUsers"`
			RegistrationOpen bool   `json:"registrationOpen"`
		} `json:"probe"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v (%s)", err, rec.Body.String())
	}
	if body.Session.Server != upstream.URL {
		t.Errorf("server = %q, want %q", body.Session.Server, upstream.URL)
	}
	if body.Session.SignedIn {
		t.Error("probing a server must not sign in")
	}
	if body.Probe.ServerName != "Alice Dox" || !body.Probe.HasUsers {
		t.Errorf("probe = %+v", body.Probe)
	}
}

func TestUnreachableServerRollsBack(t *testing.T) {
	handler, _ := newApp(t)
	rec := request(t, handler, http.MethodPut, "/__dox/server", `{"server":"http://127.0.0.1:1"}`)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}

	// The app must not be left pointed at a dead host.
	session := request(t, handler, http.MethodGet, "/__dox/session", "")
	var body struct {
		Server string `json:"server"`
	}
	_ = json.Unmarshal(session.Body.Bytes(), &body)
	if body.Server != "" {
		t.Errorf("server = %q, want it cleared after a failed probe", body.Server)
	}
}

func TestSignInProxiesAndKeepsTokenOutOfTheResponse(t *testing.T) {
	upstream := fakeServer(t)
	defer upstream.Close()

	handler, _ := newApp(t)
	request(t, handler, http.MethodPut, "/__dox/server", `{"server":"`+upstream.URL+`"}`)

	bad := request(t, handler, http.MethodPost, "/__dox/session", `{"userName":"alice","password":"nope"}`)
	if bad.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want the upstream 401", bad.Code)
	}
	if !strings.Contains(bad.Body.String(), "invalid username or password") {
		t.Errorf("body = %s, want the server's message", bad.Body.String())
	}

	rec := request(t, handler, http.MethodPost, "/__dox/session", `{"userName":"alice","password":"secret"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "jwt-1") {
		t.Errorf("the session response leaked the token: %s", rec.Body.String())
	}

	// The token now lives in Go, and the proxy injects it for the UI.
	todos := request(t, handler, http.MethodGet, "/v1/todos", "")
	if todos.Code != http.StatusOK {
		t.Fatalf("GET /v1/todos status = %d (%s)", todos.Code, todos.Body.String())
	}
	if !strings.Contains(todos.Body.String(), "from upstream") {
		t.Errorf("body = %s", todos.Body.String())
	}

	signedOut := request(t, handler, http.MethodDelete, "/__dox/session", "")
	var body struct {
		SignedIn bool `json:"signedIn"`
	}
	_ = json.Unmarshal(signedOut.Body.Bytes(), &body)
	if body.SignedIn {
		t.Error("want signed out")
	}
	if got := request(t, handler, http.MethodGet, "/v1/todos", ""); got.Code != http.StatusUnauthorized {
		t.Errorf("GET /v1/todos after sign-out = %d, want 401", got.Code)
	}
}

func TestPrefsRoundTrip(t *testing.T) {
	handler, _ := newApp(t)

	rec := request(t, handler, http.MethodPut, "/__dox/prefs", `{"lastView":"project:p1","notificationsEnabled":false,"showCompleted":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body.String())
	}

	got := request(t, handler, http.MethodGet, "/__dox/prefs", "")
	var prefs store.Preferences
	if err := json.Unmarshal(got.Body.Bytes(), &prefs); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if prefs.LastView != "project:p1" || prefs.NotificationsEnabled || !prefs.ShowCompleted {
		t.Errorf("prefs = %+v", prefs)
	}
}

func TestStaticBundleAndSpaFallback(t *testing.T) {
	handler, _ := newApp(t)

	root := request(t, handler, http.MethodGet, "/", "")
	if root.Code != http.StatusOK || !strings.Contains(root.Body.String(), "app shell") {
		t.Fatalf("GET / = %d %q", root.Code, root.Body.String())
	}
	if csp := root.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "script-src 'self'") {
		t.Errorf("csp = %q", csp)
	}

	deep := request(t, handler, http.MethodGet, "/anything/deep", "")
	if deep.Code != http.StatusOK || !strings.Contains(deep.Body.String(), "app shell") {
		t.Errorf("unknown path should serve the shell, got %d %q", deep.Code, deep.Body.String())
	}
}

func TestEventsStreamDeliversFrames(t *testing.T) {
	handler, hub := newApp(t)
	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, httpServer.URL+"/__dox/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer func() { _ = res.Body.Close() }()

	if ct := res.Header.Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("content-type = %q", ct)
	}

	hub.Publish(server.Event{Type: "open", TodoID: "t1"})

	reader := bufio.NewReader(res.Body)
	for range 10 {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if strings.HasPrefix(line, "data: ") {
			if !strings.Contains(line, `"type":"open"`) || !strings.Contains(line, `"todoId":"t1"`) {
				t.Errorf("frame = %q", line)
			}
			return
		}
	}
	t.Fatal("no data frame arrived")
}

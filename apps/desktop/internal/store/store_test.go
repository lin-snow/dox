package store_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lin-snow/dox/apps/desktop/internal/store"
)

const keyringService = "dox-desktop"

func TestDefaultsOnFirstOpen(t *testing.T) {
	s, err := store.OpenWith(t.TempDir(), store.NewMemoryKeyring())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if s.SignedIn() {
		t.Error("a fresh store must not be signed in")
	}
	if s.Server() != "" {
		t.Errorf("server = %q, want empty", s.Server())
	}
	prefs := s.Prefs()
	if prefs.LastView != "inbox" {
		t.Errorf("lastView = %q, want inbox", prefs.LastView)
	}
	if !prefs.NotificationsEnabled {
		t.Error("notifications must default to on")
	}
}

func TestPartialPrefsDocumentKeepsDefaults(t *testing.T) {
	dir := t.TempDir()
	// A document written by an older build: no notifications field, and a
	// retired field (showCompleted) that this build no longer has.
	raw := `{"server":"","prefs":{"lastView":"today","showCompleted":true}}`
	if err := os.WriteFile(filepath.Join(dir, "desktop.json"), []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}

	s, err := store.OpenWith(dir, store.NewMemoryKeyring())
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	prefs := s.Prefs()
	if prefs.LastView != "today" {
		t.Errorf("lastView = %q, want today", prefs.LastView)
	}
	if !prefs.NotificationsEnabled {
		t.Error("an absent notifications flag must keep the default (on)")
	}
}

func TestSignInAndSignOutMoveTheTokenToTheKeychain(t *testing.T) {
	dir := t.TempDir()
	ring := store.NewMemoryKeyring()
	s, err := store.OpenWith(dir, ring)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if err := s.SetServer("dox.example.com"); err != nil {
		t.Fatalf("set server: %v", err)
	}
	const server = "http://dox.example.com"
	if got := s.Server(); got != server {
		t.Fatalf("server = %q, want %q", got, server)
	}
	if err := s.SignIn("u1", "alice", "owner", "jwt-token"); err != nil {
		t.Fatalf("sign in: %v", err)
	}
	if !s.SignedIn() {
		t.Fatal("want signed in after SignIn")
	}
	if got, err := ring.Get(keyringService, server); err != nil || got != "jwt-token" {
		t.Errorf("keychain = %q, %v; want the token", got, err)
	}

	// The state file must never contain the token.
	raw, err := os.ReadFile(filepath.Join(dir, "desktop.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "jwt-token") {
		t.Errorf("desktop.json leaked the token: %s", raw)
	}

	reopened, err := store.OpenWith(dir, ring)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if !reopened.SignedIn() || reopened.Token() != "jwt-token" {
		t.Fatal("a reopened store must restore the session from the keychain")
	}

	if err := reopened.SignOut(); err != nil {
		t.Fatalf("sign out: %v", err)
	}
	if reopened.SignedIn() {
		t.Error("want signed out")
	}
	if reopened.Server() == "" {
		t.Error("sign out must keep the server so the next screen is a login")
	}
	if _, err := ring.Get(keyringService, server); err == nil {
		t.Error("sign out must delete the keychain entry")
	}
}

func TestSwitchingServersSwapsTheToken(t *testing.T) {
	ring := store.NewMemoryKeyring()
	s, err := store.OpenWith(t.TempDir(), ring)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if err := s.SetServer("https://a.example.com"); err != nil {
		t.Fatal(err)
	}
	if err := s.SignIn("u1", "alice", "owner", "token-a"); err != nil {
		t.Fatal(err)
	}

	if err := s.SetServer("https://b.example.com"); err != nil {
		t.Fatal(err)
	}
	if s.SignedIn() {
		t.Error("switching to a server with no stored token must sign out")
	}

	if err := s.SignIn("u2", "bob", "member", "token-b"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetServer("https://a.example.com"); err != nil {
		t.Fatal(err)
	}
	if s.Token() != "token-a" {
		t.Errorf("token = %q, want the token stored for server a", s.Token())
	}
	// Identity is not restored, so the app re-reads it from /v1/me.
	if _, name, _ := s.User(); name != "" {
		t.Errorf("user = %q, want it cleared on switch", name)
	}
}

func TestNormaliseServer(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"http://localhost:6278", "http://localhost:6278"},
		{"http://localhost:6278/", "http://localhost:6278"},
		{"localhost:6278", "http://localhost:6278"},
		{"  https://dox.example.com/  ", "https://dox.example.com"},
		{"https://example.com/dox/", "https://example.com/dox"},
	} {
		got, err := store.NormaliseServer(tc.in)
		if err != nil {
			t.Errorf("NormaliseServer(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("NormaliseServer(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	for _, bad := range []string{"", "   ", "ftp://example.com", "http://"} {
		if _, err := store.NormaliseServer(bad); err == nil {
			t.Errorf("NormaliseServer(%q) should fail", bad)
		}
	}
}

// A server chosen in the app must survive a restart even when the CLI points
// somewhere else entirely.
func TestImportFileSkipsWhenServerChosen(t *testing.T) {
	dir := t.TempDir()
	cfg := filepath.Join(dir, "config.toml")
	if err := os.WriteFile(cfg, []byte(`
server = "http://cli.example.com"
token = "cli-token"
user_id = "u9"
user_name = "cli-user"
role = "owner"
`), 0o600); err != nil {
		t.Fatal(err)
	}

	ring := store.NewMemoryKeyring()
	s, err := store.OpenWith(dir, ring)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	imported, err := s.ImportFile(cfg)
	if err != nil || !imported {
		t.Fatalf("first import = %v, %v; want true", imported, err)
	}
	if got := s.Server(); got != "http://cli.example.com" {
		t.Fatalf("server = %q", got)
	}

	// A server picked in the app wins on the next launch.
	if err := s.SetServer("http://mine.example.com"); err != nil {
		t.Fatal(err)
	}
	if err := s.SignOut(); err != nil {
		t.Fatal(err)
	}
	imported, err = s.ImportFile(cfg)
	if err != nil || imported {
		t.Fatalf("second import = %v, %v; want false", imported, err)
	}
	if got := s.Server(); got != "http://mine.example.com" {
		t.Fatalf("import overrode the chosen server: %q", got)
	}
}

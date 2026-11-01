// Package store owns everything the desktop app persists: the chosen server,
// the caller's identity, UI preferences, and the JWT.
//
// The JWT lives in the OS keychain — never in a file, never in JavaScript. The
// local proxy attaches it on the way out, so the renderer cannot read or
// exfiltrate the credential even if it is fully compromised.
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
	"github.com/zalando/go-keyring"
)

const (
	keyringService = "dox-desktop"
	fileName       = "desktop.json"
)

// Preferences is UI state, not domain state: the server remains the only
// source of truth for todos and projects.
type Preferences struct {
	LastView             string `json:"lastView"`
	NotificationsEnabled bool   `json:"notificationsEnabled"`
}

type record struct {
	Server   string      `json:"server,omitempty"`
	UserID   string      `json:"userId,omitempty"`
	UserName string      `json:"userName,omitempty"`
	Role     string      `json:"role,omitempty"`
	Prefs    Preferences `json:"prefs"`
}

// Keyring is the secret-storage seam, so tests never touch the real keychain.
// Get and Delete must report an absent entry as keyring.ErrNotFound.
type Keyring interface {
	Get(service, user string) (string, error)
	Set(service, user, secret string) error
	Delete(service, user string) error
}

// Store is safe for concurrent use: the HTTP handlers and the reminder poller
// read it from different goroutines.
type Store struct {
	mu    sync.Mutex
	path  string
	ring  Keyring
	data  record
	token string
}

// Open loads (or initialises) the app state under dir.
func Open(dir string) (*Store, error) {
	return OpenWith(dir, osKeyring{})
}

// OpenWith is Open with an injected keyring: the seam tests use, and the hook a
// platform without a working keychain (headless Linux) would need.
func OpenWith(dir string, ring Keyring) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}

	s := &Store{
		path: filepath.Join(dir, fileName),
		ring: ring,
		// Defaults, then unmarshal on top: fields absent from the file keep
		// these values, which is how "notifications are on unless turned off"
		// survives a partial prefs document.
		data: record{Prefs: Preferences{LastView: "inbox", NotificationsEnabled: true}},
	}

	raw, err := os.ReadFile(s.path)
	switch {
	case errors.Is(err, os.ErrNotExist):
	case err != nil:
		return nil, fmt.Errorf("read %s: %w", s.path, err)
	default:
		if err := json.Unmarshal(raw, &s.data); err != nil {
			return nil, fmt.Errorf("parse %s: %w", s.path, err)
		}
	}

	if s.data.Server != "" {
		token, err := ring.Get(keyringService, s.data.Server)
		if err != nil && !errors.Is(err, keyring.ErrNotFound) {
			return nil, fmt.Errorf("read keychain: %w", err)
		}
		s.token = token
	}
	return s, nil
}

func (s *Store) Server() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Server
}

// Base is the proxy's target, or nil before a server has been chosen.
func (s *Store) Base() *url.URL {
	server := s.Server()
	if server == "" {
		return nil
	}
	parsed, err := url.Parse(server)
	if err != nil {
		return nil
	}
	return parsed
}

func (s *Store) Token() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.token
}

func (s *Store) SignedIn() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.token != "" && s.data.UserName != ""
}

func (s *Store) User() (id, name, role string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.UserID, s.data.UserName, s.data.Role
}

func (s *Store) Prefs() Preferences {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Prefs
}

func (s *Store) SetPrefs(prefs Preferences) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Prefs = prefs
	return s.persist()
}

// SetServer points the app at a server. Switching servers swaps the token to
// that server's keychain entry, so returning to a previously used server does
// not require signing in again.
func (s *Store) SetServer(raw string) error {
	normalised, err := NormaliseServer(raw)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.data.Server == normalised {
		return nil
	}
	s.data.Server = normalised
	s.data.UserID, s.data.UserName, s.data.Role = "", "", ""
	s.token = ""

	token, err := s.ring.Get(keyringService, normalised)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("read keychain: %w", err)
	}
	s.token = token
	return s.persist()
}

// ClearServer forgets the server entirely, used when a first-time connection
// attempt fails and there is nothing to roll back to.
func (s *Store) ClearServer() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Server = ""
	s.data.UserID, s.data.UserName, s.data.Role = "", "", ""
	s.token = ""
	return s.persist()
}

// SignIn stores the token in the keychain and the identity in the app file.
func (s *Store) SignIn(userID, userName, role, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.data.Server == "" {
		return errors.New("no server configured")
	}
	if err := s.ring.Set(keyringService, s.data.Server, token); err != nil {
		return fmt.Errorf("write keychain: %w", err)
	}
	s.token = token
	s.data.UserID, s.data.UserName, s.data.Role = userID, userName, role
	return s.persist()
}

// SignOut forgets the token for the current server but keeps the server URL,
// so the next screen is a login for the same place.
func (s *Store) SignOut() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.data.Server != "" {
		if err := s.ring.Delete(keyringService, s.data.Server); err != nil &&
			!errors.Is(err, keyring.ErrNotFound) {
			return fmt.Errorf("delete keychain entry: %w", err)
		}
	}
	s.token = ""
	s.data.UserID, s.data.UserName, s.data.Role = "", "", ""
	return s.persist()
}

// ImportCLI adopts the credentials the CLI already wrote to
// ~/.config/dox/config.toml, so a machine that uses dox from the terminal is
// already signed in here. Returns true when a session was imported.
func (s *Store) ImportCLI() (bool, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return false, nil
	}
	return s.ImportFile(filepath.Join(home, ".config", "dox", "config.toml"))
}

// ImportFile adopts credentials from an explicit dox config.toml. Split from
// ImportCLI so the path is injectable in tests.
func (s *Store) ImportFile(path string) (bool, error) {
	// Never override a choice already made here: a server picked in the app
	// outranks whatever the CLI happens to point at, signed in or not.
	if s.SignedIn() || s.Server() != "" {
		return false, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return false, nil
	}

	var cfg struct {
		Server   string `toml:"server"`
		Token    string `toml:"token"`
		UserID   string `toml:"user_id"`
		UserName string `toml:"user_name"`
		Role     string `toml:"role"`
	}
	if err := toml.Unmarshal(raw, &cfg); err != nil || cfg.Server == "" || cfg.Token == "" {
		return false, nil
	}
	if err := s.SetServer(cfg.Server); err != nil {
		return false, nil
	}
	if err := s.SignIn(cfg.UserID, cfg.UserName, cfg.Role, cfg.Token); err != nil {
		return false, err
	}
	return true, nil
}

// NormaliseServer accepts "host:6278", "http://host:6278/" and friends, and
// returns the canonical form the app stores.
func NormaliseServer(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", errors.New("server URL is required")
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("invalid server URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("server URL must start with http:// or https://")
	}
	if parsed.Host == "" {
		return "", errors.New("server URL is missing a host")
	}
	parsed.RawQuery, parsed.Fragment = "", ""
	parsed.Path = strings.TrimSuffix(parsed.Path, "/")
	return parsed.String(), nil
}

func (s *Store) persist() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')

	// Write-then-rename so a crash mid-write cannot truncate the state file.
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".desktop-*.json")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()

	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}

// OSKeyring is the platform secret store: Keychain on macOS, Secret Service on
// Linux, Credential Manager on Windows.
func OSKeyring() Keyring { return osKeyring{} }

type osKeyring struct{}

func (osKeyring) Get(service, user string) (string, error) { return keyring.Get(service, user) }

func (osKeyring) Set(service, user, secret string) error {
	return keyring.Set(service, user, secret)
}

func (osKeyring) Delete(service, user string) error { return keyring.Delete(service, user) }

package store

import (
	"sync"

	"github.com/zalando/go-keyring"
)

// MemoryKeyring keeps secrets in process memory and forgets them on exit. It
// backs `-keyring memory` (development and smoke tests) and is what the tests
// inject, so nothing in the suite touches the real keychain.
type MemoryKeyring struct {
	mu      sync.Mutex
	entries map[string]string
}

func NewMemoryKeyring() *MemoryKeyring {
	return &MemoryKeyring{entries: make(map[string]string)}
}

func (m *MemoryKeyring) Get(service, user string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	value, ok := m.entries[service+"/"+user]
	if !ok {
		return "", keyring.ErrNotFound
	}
	return value, nil
}

func (m *MemoryKeyring) Set(service, user, secret string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries[service+"/"+user] = secret
	return nil
}

func (m *MemoryKeyring) Delete(service, user string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.entries[service+"/"+user]; !ok {
		return keyring.ErrNotFound
	}
	delete(m.entries, service+"/"+user)
	return nil
}

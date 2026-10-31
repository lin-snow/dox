package authn

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

// MinPasswordLen is the minimum we accept. No complexity rules — owner can
// extend later if needed.
const MinPasswordLen = 8

// Argon2 parameters. Tuned for 2026 OWASP defaults; ~30ms on commodity x86.
const (
	argonTime    = 3
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

// ErrHashBusy is returned when the password-hashing gate stays saturated past
// hashQueueTimeout. argon2id at 64 MiB per call is intentionally expensive;
// without a cap, a burst of login attempts can exhaust server memory.
var ErrHashBusy = errors.New("authn: password hashing saturated")

const hashQueueTimeout = 5 * time.Second

// hashSlots caps concurrent argon2 work. Each call allocates 64 MiB, so the
// cap is deliberately small: four slots bound the worst case at 256 MiB.
var hashSlots = make(chan struct{}, min(4, max(2, runtime.NumCPU())))

// HashPasswordContext is HashPassword bounded by the global hashing gate and
// the caller's context. Handlers use this instead of HashPassword directly.
func HashPasswordContext(ctx context.Context, plain string) (string, error) {
	var encoded string
	err := withHashSlot(ctx, func() error {
		var err error
		encoded, err = HashPassword(plain)
		return err
	})
	return encoded, err
}

// VerifyPasswordContext is VerifyPassword bounded by the same gate.
func VerifyPasswordContext(ctx context.Context, candidate, encoded string) (bool, error) {
	var ok bool
	err := withHashSlot(ctx, func() error {
		ok = VerifyPassword(candidate, encoded)
		return nil
	})
	return ok, err
}

func withHashSlot(ctx context.Context, fn func() error) error {
	select {
	case hashSlots <- struct{}{}:
		defer func() { <-hashSlots }()
		return fn()
	default:
	}

	timer := time.NewTimer(hashQueueTimeout)
	defer timer.Stop()
	select {
	case hashSlots <- struct{}{}:
		defer func() { <-hashSlots }()
		return fn()
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return ErrHashBusy
	}
}

// HashPassword returns an argon2id PHC-encoded string. Salt is per-call random.
func HashPassword(plain string) (string, error) {
	if len(plain) < MinPasswordLen {
		return "", fmt.Errorf("password must be at least %d characters", MinPasswordLen)
	}
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("authn: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(plain), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// VerifyPassword returns true iff the candidate matches the encoded hash.
// Constant-time comparison; malformed encodings return false (never panic).
func VerifyPassword(candidate, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return false
	}
	if version != argon2.Version {
		return false
	}
	var m uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(candidate), salt, t, m, p, uint32(len(key)))
	return subtle.ConstantTimeCompare(got, key) == 1
}

// GenerateTempPassword returns a 12-char random password from the same
// friendly Crockford Base32 alphabet invite codes use. Read-aloud safe — no
// confusable I/L/O/U glyphs. Used by ResetUserPassword.
func GenerateTempPassword() (string, error) {
	const length = 12
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", errors.New("authn: read random for temp password")
	}
	out := make([]byte, length)
	for i, b := range buf {
		out[i] = codeAlphabet[int(b)%len(codeAlphabet)]
	}
	return string(out), nil
}

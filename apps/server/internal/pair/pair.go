// Package pair handles short-lived pairing codes and the per-device bearer
// tokens they exchange for. Codes are stored in the pairing_codes table so
// the `dox-server pair` admin CLI and the running HTTP server can share state
// without IPC.
package pair

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// Crockford Base32 alphabet (no I, L, O, U) — keeps codes unambiguous when
// read aloud or typed.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const (
	codeLen  = 8  // 40 bits — collision-safe within the 60s window
	tokenLen = 32 // 256-bit bearer token, hex-encoded for header use
)

// GenerateCode returns a fresh 8-character Crockford Base32 pairing code.
func GenerateCode() (string, error) {
	buf := make([]byte, codeLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, codeLen)
	for i, b := range buf {
		// 256 % 32 == 0 so modulo is unbiased.
		out[i] = alphabet[int(b)%32]
	}
	return string(out), nil
}

// FormatCode renders a code with a hyphen for display: "ABCD-EFGH".
func FormatCode(code string) string {
	if len(code) != codeLen {
		return code
	}
	return code[:4] + "-" + code[4:]
}

// NormalizeCode accepts user input in any case with or without hyphens/spaces
// and returns the canonical storage form.
func NormalizeCode(input string) string {
	r := strings.NewReplacer("-", "", " ", "")
	return strings.ToUpper(r.Replace(input))
}

// GenerateToken returns a fresh 256-bit bearer token, hex-encoded.
func GenerateToken() (string, error) {
	buf := make([]byte, tokenLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// HashToken returns a hex SHA-256 of the token suitable for at-rest storage.
// Tokens are only ever transmitted in plaintext once (at redemption); after
// that the server compares hashes.
func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

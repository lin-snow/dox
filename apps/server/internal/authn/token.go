package authn

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

const tokenLen = 32

// GenerateToken returns a fresh 256-bit bearer token, hex-encoded.
func GenerateToken() (string, error) {
	buf := make([]byte, tokenLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// HashToken returns a hex SHA-256 of a bearer token. Tokens are transmitted in
// plaintext only at redemption; thereafter the server compares hashes.
func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

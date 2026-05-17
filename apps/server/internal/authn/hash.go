package authn

import (
	"crypto/sha256"
	"encoding/hex"
)

// HashInviteCode is the canonical hash function for invite codes. Plaintext
// codes are accepted from clients in any case with hyphens/spaces; we
// normalize then hash.
func HashInviteCode(code string) string {
	h := sha256.Sum256([]byte(NormalizeCode(code)))
	return hex.EncodeToString(h[:])
}

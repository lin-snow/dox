package authn

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

// inviteCodeKeyContext domain-separates invite hashes from the JWT secret's
// other uses, so the same key material can safely back both.
const inviteCodeKeyContext = "dox/invite-code/v1"

// KeyedHashInviteCode hashes an invite code with the server secret. Codes are
// short (40 bits), so an unkeyed digest would let anyone holding a database
// copy enumerate still-valid invites offline. Keying the digest makes that
// impossible without the secret.
func KeyedHashInviteCode(secret []byte, code string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(inviteCodeKeyContext))
	mac.Write([]byte{0})
	mac.Write([]byte(NormalizeCode(code)))
	return hex.EncodeToString(mac.Sum(nil))
}

// LegacyHashInviteCode is the unkeyed SHA-256 digest used before keyed
// hashing landed. It exists only so invites issued by older builds remain
// redeemable; never write new rows with it.
func LegacyHashInviteCode(code string) string {
	h := sha256.Sum256([]byte(NormalizeCode(code)))
	return hex.EncodeToString(h[:])
}

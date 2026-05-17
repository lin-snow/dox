// Package authn covers the authentication mechanism: HTTP bearer middleware,
// the JWT verifier that backs it, password hashing (argon2id), and the
// short-code primitives used by invite codes. No proto handlers live here.
package authn

import (
	"crypto/rand"
	"strings"
)

// Crockford Base32 alphabet (no I, L, O, U) — unambiguous when read aloud.
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const codeLen = 8

// GenerateCode returns a fresh 8-character Crockford Base32 code. Used by
// invite codes; pairing is no longer a concept in dox.
func GenerateCode() (string, error) {
	buf := make([]byte, codeLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, codeLen)
	for i, b := range buf {
		// 256 % 32 == 0 so modulo is unbiased.
		out[i] = codeAlphabet[int(b)%32]
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

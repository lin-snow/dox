package authn

import (
	"regexp"
	"testing"
)

func TestTokenHashing(t *testing.T) {
	token, err := GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(token) != tokenLen*2 {
		t.Errorf("want hex length %d, got %d", tokenLen*2, len(token))
	}
	if !regexp.MustCompile(`^[0-9a-f]+$`).MatchString(token) {
		t.Errorf("token is not lowercase hex: %q", token)
	}

	h1 := HashToken(token)
	h2 := HashToken(token)
	if h1 != h2 {
		t.Error("HashToken is not deterministic")
	}
	if h1 == token {
		t.Error("HashToken returned the input verbatim")
	}
	if len(h1) != 64 {
		t.Errorf("want 64-char hex sha256, got %q", h1)
	}
}

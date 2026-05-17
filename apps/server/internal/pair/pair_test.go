package pair

import (
	"regexp"
	"strings"
	"testing"
)

func TestGenerateCode(t *testing.T) {
	code, err := GenerateCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != codeLen {
		t.Errorf("want len %d, got %d", codeLen, len(code))
	}
	if !regexp.MustCompile(`^[` + alphabet + `]+$`).MatchString(code) {
		t.Errorf("code %q contains chars outside alphabet", code)
	}

	// Distinct calls produce distinct codes (with overwhelming probability).
	seen := map[string]bool{code: true}
	for i := 0; i < 100; i++ {
		c, err := GenerateCode()
		if err != nil {
			t.Fatal(err)
		}
		if seen[c] {
			t.Fatalf("duplicate code after %d iterations", i)
		}
		seen[c] = true
	}
}

func TestFormatCode(t *testing.T) {
	if got := FormatCode("ABCDEFGH"); got != "ABCD-EFGH" {
		t.Errorf("want ABCD-EFGH, got %q", got)
	}
	// Wrong-length input is returned unchanged.
	if got := FormatCode("X"); got != "X" {
		t.Errorf("want X, got %q", got)
	}
}

func TestNormalizeCode(t *testing.T) {
	tests := map[string]string{
		"ABCD-EFGH": "ABCDEFGH",
		"abcd-efgh": "ABCDEFGH",
		"ab cd efgh": "ABCDEFGH",
		"abcdefgh":   "ABCDEFGH",
	}
	for in, want := range tests {
		if got := NormalizeCode(in); got != want {
			t.Errorf("NormalizeCode(%q) = %q, want %q", in, got, want)
		}
	}
}

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
	if !strings.HasPrefix(h1, "") || len(h1) != 64 {
		t.Errorf("want 64-char hex sha256, got %q", h1)
	}
}

package auth

import (
	"regexp"
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
	if !regexp.MustCompile(`^[` + codeAlphabet + `]+$`).MatchString(code) {
		t.Errorf("code %q contains chars outside alphabet", code)
	}

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
	if got := FormatCode("X"); got != "X" {
		t.Errorf("want X, got %q", got)
	}
}

func TestNormalizeCode(t *testing.T) {
	tests := map[string]string{
		"ABCD-EFGH":  "ABCDEFGH",
		"abcd-efgh":  "ABCDEFGH",
		"ab cd efgh": "ABCDEFGH",
		"abcdefgh":   "ABCDEFGH",
	}
	for in, want := range tests {
		if got := NormalizeCode(in); got != want {
			t.Errorf("NormalizeCode(%q) = %q, want %q", in, got, want)
		}
	}
}

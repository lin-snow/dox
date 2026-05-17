package version

import (
	"strings"
	"testing"
)

func TestResolve_DefaultsWhenAllEmpty(t *testing.T) {
	// resolve() reads package vars directly, so save & clear them.
	defer restore(version, commit, date, builtBy)
	version, commit, date, builtBy = "", "", "", ""

	got := resolve()
	// Under `go test` debug.ReadBuildInfo() returns Main.Version="(devel)"
	// for the test binary; either that or our "dev" fallback is acceptable.
	if got.Version == "" {
		t.Errorf("Version should not be empty")
	}
	if got.Commit == "" {
		t.Errorf("Commit should not be empty (fallback to \"unknown\")")
	}
	if got.GoVersion == "" || got.OS == "" || got.Arch == "" {
		t.Errorf("runtime fields missing: %+v", got)
	}
}

func TestResolve_LdflagsWin(t *testing.T) {
	defer restore(version, commit, date, builtBy)
	version, commit, date, builtBy = "v9.9.9", "deadbeef", "2026-05-17T00:00:00Z", "test"

	got := resolve()
	if got.Version != "v9.9.9" || got.Commit != "deadbeef" ||
		got.Date != "2026-05-17T00:00:00Z" || got.BuiltBy != "test" {
		t.Errorf("ldflags values not preserved: %+v", got)
	}
}

func TestInfo_String(t *testing.T) {
	s := Info{Version: "v1", Commit: "abc", GoVersion: "go1.0", OS: "linux", Arch: "amd64"}.String()
	if !strings.Contains(s, "v1") || !strings.Contains(s, "abc") ||
		!strings.Contains(s, "linux/amd64") {
		t.Errorf("String missing fields: %q", s)
	}
}

func TestInfo_Banner(t *testing.T) {
	b := Info{Version: "v1", Commit: "abc", GoVersion: "go1.0", OS: "linux", Arch: "amd64"}.Banner()
	if !strings.Contains(b, "v1") || !strings.Contains(b, "dox") {
		t.Errorf("Banner missing identity: %q", b)
	}
}

func restore(v, c, d, b string) {
	version, commit, date, builtBy = v, c, d, b
}

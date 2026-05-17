// Package version exposes build identity for the dox server. Values come from
// two sources, in order of preference:
//
//  1. -ldflags "-X .../version.version=v1.2.3 -X .../version.commit=abcdef
//     -X .../version.date=2026-05-17T00:00:00Z -X .../version.builtBy=goreleaser"
//  2. runtime/debug.ReadBuildInfo() (populated automatically for module builds,
//     including `go build` and `go install`; vcs.* keys exist when building
//     from a git checkout).
//
// This way release builds get pinned identity via ldflags, while `go run` /
// ad-hoc `go build` still surface a useful commit + dirty flag.
package version

import (
	"fmt"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
)

// Linker-injected values. Keep the variables un-typed-constants so that
// -ldflags "-X" can overwrite them at link time (only string vars are
// writable that way).
var (
	version = ""
	commit  = ""
	date    = ""
	builtBy = ""
)

// Info is a snapshot of build identity. Safe to copy; fields are immutable
// after Get() returns.
type Info struct {
	Version   string // semver-ish, e.g. "v0.3.1" or "dev"
	Commit    string // short git sha, possibly with "-dirty" suffix
	Date      string // RFC3339 build timestamp, or "" if unknown
	BuiltBy   string // "ldflags", "go-build", or a CI tag like "goreleaser"
	GoVersion string // runtime.Version()
	OS        string // runtime.GOOS
	Arch      string // runtime.GOARCH
}

var (
	once   sync.Once
	cached Info
)

// Get returns the build identity. Result is cached after the first call.
func Get() Info {
	once.Do(func() { cached = resolve() })
	return cached
}

func resolve() Info {
	info := Info{
		Version:   version,
		Commit:    commit,
		Date:      date,
		BuiltBy:   builtBy,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
	}

	bi, ok := debug.ReadBuildInfo()
	if !ok {
		// `go test` without module info, or a stripped binary. Fill blanks.
		fillDefaults(&info)
		return info
	}

	if info.Version == "" {
		// bi.Main.Version is "(devel)" for local builds; keep it as a signal
		// rather than overwriting with "dev" so users can tell the two apart.
		info.Version = bi.Main.Version
	}

	var vcsRev, vcsTime string
	var dirty bool
	for _, s := range bi.Settings {
		switch s.Key {
		case "vcs.revision":
			vcsRev = s.Value
		case "vcs.time":
			vcsTime = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if info.Commit == "" && vcsRev != "" {
		short := vcsRev
		if len(short) > 12 {
			short = short[:12]
		}
		if dirty {
			short += "-dirty"
		}
		info.Commit = short
	}
	if info.Date == "" && vcsTime != "" {
		info.Date = vcsTime
	}
	if info.BuiltBy == "" {
		info.BuiltBy = "go-build"
	}
	fillDefaults(&info)
	return info
}

func fillDefaults(info *Info) {
	if info.Version == "" {
		info.Version = "dev"
	}
	if info.Commit == "" {
		info.Commit = "unknown"
	}
	if info.BuiltBy == "" {
		info.BuiltBy = "unknown"
	}
}

// String returns a single-line human summary, e.g.
// "dox v0.3.1 (abcdef12, go1.26.2 darwin/arm64)".
func (i Info) String() string {
	return fmt.Sprintf("dox %s (%s, %s %s/%s)",
		i.Version, i.Commit, i.GoVersion, i.OS, i.Arch)
}

// Short returns just "<version> (<commit>)", useful for log lines.
func (i Info) Short() string {
	return fmt.Sprintf("%s (%s)", i.Version, i.Commit)
}

// Banner returns the startup logo with the version line appended. Caller
// writes it to stderr (slog already owns stdout / structured logs).
func (i Info) Banner() string {
	var b strings.Builder
	b.WriteString(logo)
	b.WriteByte('\n')
	fmt.Fprintf(&b, "  %s\n", i.String())
	if i.Date != "" {
		fmt.Fprintf(&b, "  built %s by %s\n", i.Date, i.BuiltBy)
	}
	return b.String()
}

// logo is intentionally plain ASCII (no ANSI colors): it goes to whatever
// stream the operator is tailing, including non-TTY systemd journals.
const logo = `
       __          
  ____/ /___  _  __
 / __  / __ \| |/_/
/ /_/ / /_/ />  <  
\__,_/\____/_/|_|  
                   
`

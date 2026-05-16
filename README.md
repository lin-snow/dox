# dox

[github.com/lin-snow/dox](https://github.com/lin-snow/dox) · AGPL-3.0

**dox** is a self-hosted personal todo app: one Go server, a SQLite database,
and a TypeScript binary that flips between TUI and CLI based on context.

```
┌─ dox server ──────────────────────┐         ┌─ dox client ──────────────────┐
│  Go + grpc-gateway                │         │  Bun + TypeScript             │
│  modernc.org/sqlite (zero CGO)    │ HTTP/   │  Ink TUI + Commander CLI      │
│  sqlc + goose                     │ ◄─────► │  Single binary, two modes     │
│  protobuf is single source        │  JSON   │  Thin client (no local data)  │
└───────────────────────────────────┘         └───────────────────────────────┘
```

## Core principles

- **Thin client.** The server owns all state; the client makes HTTP/JSON calls
  for every operation. No outbox, no sync engine, no offline. If the server is
  down, dox is down.
- **One contract surface.** `proto/dox/v1/*.proto` is the only place an API
  shape lives; Go server stubs, TS client types, and OpenAPI docs are all
  generated from it.
- **`@dox/core` is UI-agnostic.** It owns domain types, the HTTP client, and
  the output adapters. Anything `ink`, `react`, `commander`, or `@clack/*`
  lives in `apps/cli/`.

## Stack

### Server (Go)

| Concern | Choice |
|---|---|
| Language | Go (current stable) |
| Contract | Protocol Buffers via `buf` |
| RPC / HTTP | gRPC + grpc-gateway |
| OpenAPI | `protoc-gen-openapi` (gnostic) |
| Database | SQLite, `modernc.org/sqlite` driver (no CGO) |
| Queries | `sqlc` (compile-time SQL → typed Go) |
| Migrations | `goose` v3 + `embed.FS`, auto-applied on boot |
| Logging | `log/slog`, JSON handler |
| Config | env vars (`DOX_BOOTSTRAP_TOKEN`, `DOX_DB_PATH`, `DOX_LISTEN_ADDR`, `DOX_LOG_LEVEL`) |
| Auth | bearer token (env bootstrap; pairing-code flow planned) |
| IDs | ULID, server-generated |
| Timestamps | UTC `int64` unix milliseconds |

### Client (TypeScript)

| Concern | Choice |
|---|---|
| Runtime | Bun (Node-compatible code; no bun-only APIs) |
| Language | TypeScript, strict mode |
| Workspaces | Bun workspaces |
| TUI | Ink + React + `@inkjs/ui` |
| CLI | Commander + `@clack/prompts` |
| State | Ink built-in `useReducer` |
| Config / token | `~/.config/dox/config.toml` (chmod 600) |
| Tests | `bun:test` + `ink-testing-library` |

## Layout

```
dox/
├── proto/dox/v1/todo.proto              # contract, single source of truth
│
├── apps/
│   ├── server/
│   │   ├── cmd/dox-server/main.go       # config + signal + delegate to server.Run
│   │   ├── internal/
│   │   │   ├── server/                  # HTTP wiring + graceful shutdown
│   │   │   ├── service/                 # gRPC handlers
│   │   │   ├── auth/                    # bearer-token middleware
│   │   │   ├── config/                  # env loader
│   │   │   └── db/
│   │   │       ├── migrate.go           # goose embed.FS auto-Up
│   │   │       ├── migrations/*.sql     # timestamped
│   │   │       └── queries/             # sqlc-generated
│   │   ├── gen/                         # buf-generated Go (pb / grpc / gw / openapi)
│   │   └── sqlc.yaml
│   │
│   └── cli/
│       └── src/
│           ├── index.ts                 # TTY → TUI; subcommand or pipe → CLI
│           ├── cli/                     # Commander handlers (add/get/edit/done/rm/list/login)
│           └── tui/                     # Ink app (App, components, state)
│
├── packages/
│   ├── proto-gen/                       # buf-generated TS
│   └── core/                            # @dox/core (UI-agnostic)
│       └── src/{api,config,output}/
│
├── buf.yaml / buf.gen.yaml              # codegen pipeline
├── justfile                             # task runner (generate / server-dev / cli / tests)
└── README.md
```

## Quick start

```bash
# One-time setup
brew install go bun buf just sqlite
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
bun install

# Generate code from proto (Go + TS + OpenAPI)
just generate

# Run server (auto-generates a dev token, prints it)
just server-dev

# In another terminal:
just cli -- login --server http://localhost:8080
just cli -- add "buy milk"
just cli -- list
just cli                                  # opens TUI
```

## Key design decisions

### 1. proto is the only contract

```
edit proto → buf lint → buf generate → implement both sides
```

`buf.yaml` excepts `RPC_RESPONSE_STANDARD_NAME` and `RPC_REQUEST_RESPONSE_UNIQUE`
so `Todo` can be the response type for `Get`, `Create`, and `Update` without
wrapper messages.

### 2. One TS binary, two modes

```ts
if (args.length === 0 && process.stdout.isTTY) {
  await runTui();
} else {
  // Commander routes subcommands or returns --help.
}
```

A TTY with no subcommand launches the Ink TUI. Anything else (`dox add ...`,
piped input, `--json`) uses the CLI path.

### 3. Thin client, server-authoritative

The CLI and TUI both go through `@dox/core/api.ApiClient` for every read and
write. There is no local cache. Multi-device sync is "open dox again, or hit
`r`"; a 30-second background poll covers the rest. WebSocket/SSE was rejected
as overkill for personal scope.

### 4. Auth: bearer token now, pairing later

v0.x uses one shared `DOX_BOOTSTRAP_TOKEN` from the environment, validated
with `crypto/subtle.ConstantTimeCompare`. v0.y will add a pairing-code flow
(server CLI generates a 60-second code; client redeems it for a per-device
token recorded in a `device_tokens` table). OAuth, JWT, and accounts are out
of scope — single-user self-hosted means "whoever can SSH to the server is
the admin."

### 5. SQLite pragmas

`db.Open` applies WAL, NORMAL sync, foreign keys on, 5s busy timeout, 64MB
cache, in-memory temp store; the pool is capped at one connection because
SQLite serializes writes. Migrations are embedded into the binary via
`embed.FS` and `goose.Up` runs on every boot.

### 6. IDs and timestamps

ULIDs are server-generated and Crockford-Base32 (case-insensitive). The CLI
accepts any unique prefix — `dox done 01krrq` resolves on the server unless
ambiguous, in which case it returns `FailedPrecondition` and asks for more
characters.

Timestamps are stored and exchanged as `int64` unix milliseconds (UTC). No
`google.protobuf.Timestamp` — the seconds/nanos pair is heavier on the wire
and awkward in JSON.

### 7. CLI / TUI keybindings

TUI (list mode):

| Key | Action |
|---|---|
| `j` / `k`, `↓` / `↑` | Move cursor |
| `space` | Toggle done |
| `i` / `a` | New todo |
| `e` | Edit cursored todo |
| `d` | Delete cursored todo |
| `r` | Refresh now |
| `q` / `Ctrl-C` | Quit |

In add / edit mode: type text, `Enter` to save, empty + `Enter` to cancel.

CLI: `dox login` · `dox list` · `dox add <title>` · `dox get <id>` ·
`dox done <id>` · `dox undone <id>` · `dox edit <id> --title <text>` ·
`dox rm <id>`. Global `--json` switches to machine-readable output.

## Distribution (planned)

| Path | Size | Audience |
|---|---|---|
| `bun install -g @dox/cli` | ~10 MB | developers with Bun |
| `bun build --compile` single binary | ~55 MB | zero-dependency users |
| Docker image | depends | server self-hosters |

## Roadmap

- **M4 — Pairing code flow.** Replace the env bootstrap token with per-device
  tokens, managed via `dox-server pair / device list / device revoke`.
- **M5 — Distribution.** Dockerfile, multi-arch GoReleaser, `bun build
  --compile`, npm publish, GitHub Actions CI.
- **Data model.** v0 keeps `id / title / done / created_at / updated_at`.
  Tags, priority, due date, recurring — later, deliberately.

## Excluded by design

- Offline / local-first / sync engine (this is a thin client, on purpose).
- WebSocket / SSE for realtime (`r` and a 30s poll are enough).
- OAuth / JWT / accounts.
- ORMs (GORM in particular).
- `mattn/go-sqlite3` (CGO breaks cross-compilation).
- Electron (Tauri later, if a desktop target appears).
- Bun-only APIs in client code (`bun:sqlite`, `Bun.serve`, etc.); Node
  compatibility is kept open for cheap.

## References

- [Ech0](https://github.com/lin-snow/Ech0) — author's other self-hosted Go
  project; the same engineering patterns apply here.
- [Claude Code](https://claude.com/claude-code), [OpenCode](https://opencode.ai) — Ink + React TUI prior art.
- [gh CLI](https://github.com/cli/cli) — single binary that flips between CLI
  and TUI cleanly.
- [lazygit](https://github.com/jesseduffield/lazygit), [k9s](https://k9scli.io) — TUI interaction inspiration.
- [Tailscale](https://tailscale.com), [Syncthing](https://syncthing.net) — pairing-code flow prior art for
  self-hosted, single-user tools.

# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`dox` is a self-hosted single-user / small-team todo app: a Go server binary that holds all state, and a thin TypeScript CLI/TUI client that talks to it over HTTP/JSON (no local cache). Whoever registers first becomes the owner; everyone else gets in via invite.

## Commands

All routine work goes through `justfile` recipes.

```bash
just                    # list all recipes
just gen                # proto → Go + TS + OpenAPI, sqlc → Go DB bindings
just check              # full lint/format/typecheck pipeline (see scripts/check.sh)
just test               # Go (cd apps/server && go test ./...) + Bun (bun test)
just serve              # run server with version/commit injected via -ldflags
just cli -- <args>      # run CLI against local server, e.g. `just cli -- list`
just server-build       # build apps/server/bin/dox-server
just docker-build       # local image build, tags `dox:local` (mirrors CI)
just release vX.Y.Z     # tag main + push → triggers Docker Hub release
```

Single tests:

```bash
cd apps/server && go test ./internal/handler -run TestCreateTodo
bun test apps/cli/src/tui/App.test.tsx
```

Always run `just gen` after editing anything under `proto/` or `apps/server/internal/db/{migrations,queries}/*.sql`. Generated output lives in `apps/server/gen/` and `packages/proto-gen/src/` and is **gitignored** — never hand-edit it.

## Architecture

### Top-level layout

```
proto/dox/v1/                    contract: auth, user, project, invite, todo, event
apps/server/                     Go binary (cmd/dox-server, internal/*)
apps/cli/                        TS thin client — CLI (commander) + TUI (Ink/React)
apps/desktop/                    Wails v3 desktop client — Go backend + React webview
packages/core/                   shared TS: http client, config, output, per-resource SDKs
packages/proto-gen/              generated TS message types (buf out)
docker/, .github/workflows/      release.yml → Docker Hub + draft GH release
docs/onboarding.md               canonical reference for the auth/onboarding state machine
```

### Server (apps/server/internal/)

Composition root is `app.Run` (`apps/server/internal/app/app.go`):

1. `db.Open(cfg.DBPath)` opens SQLite and runs goose migrations from `internal/db/migrations`.
2. `queries.New(db)` produces the sqlc-generated query handle.
3. Handlers are constructed and registered onto a single `runtime.NewServeMux()` (grpc-gateway). The mux is wrapped in the authn middleware. There is **no native gRPC listener** — only HTTP/JSON via grpc-gateway. Clients hit `/v1/...` with fetch.
4. A background event-retention sweeper runs alongside the HTTP server, bounded to `Run`'s context so shutdown waits for in-flight DELETEs before closing the DB.

Package responsibilities (do not invent new ones — see `dox-server-layout` memory):

- `caller/` — `Caller{UserID, UserName, Role}` carried through `context.Context`. Middleware writes, handlers read via `MustFrom`.
- `authn/` — JWT verification + middleware. `publicPaths` is the **only** allowlist: `/v1/auth/server-info`, `/v1/auth/register`, `/v1/auth/login`. Everything else requires a bearer token.
- `authz/` — three project-scoped predicates: `CanReadProject`, `CanWriteProjectTodos`, `CanAdminProject`. Status-code policy is explicit: **reads on invisible objects return NotFound (no existence leak); writes by visible-but-unprivileged callers return PermissionDenied.**
- `notifier/` — the due-date reminder sweep: a ticker goroutine (same shape as the retention sweep) that scans open todos by `COALESCE(remind_at, due_at)`, writes idempotent `notifications` rows and hands them to optional `Deliverer`s. Deliberately **not** a `bus` subscriber: the bus is tx-bound and reentrant with mutations, reminders are time-triggered.
- `handler/` — RPC handlers. One file per service. Mutations that need to publish bus messages atomically wrap the write + `bus.Publish` in `runInTx` (`handler/events.go`) so a subscriber failure rolls the mutation back. `handler/notification.go` is read/ack only — clients can never fabricate reminders.
- `bus/` — in-process synchronous pub/sub. Mutation handlers publish typed `Msg` values; the default `ActivityRecorder` subscriber persists them as `events` rows. To add a new activity verb: declare a struct + `msg()` method in `bus/bus.go`, add a recorder case, publish from the handler. Adding a new subscriber (webhook/audit) means passing it to `bus.New(...)` in `app.go` — handler code is untouched.
- `app/` — wiring + the retention sweep loop in `cleanup.go`.
- `config/` — env-driven (`DOX_DB_PATH`, `DOX_LISTEN_ADDR`, `DOX_LOG_LEVEL`, `DOX_EVENT_RETENTION`).
- `version/` — `version`, `commit`, `date`, `builtBy` are injected via `-ldflags` (see `justfile` / `release.yml`).
- `webui/` — the minimal, build-stepless web UI: `//go:embed static`, served at exactly `GET /` and `GET /static/...`. It is mounted **outside** the auth chain because it is public static bytes; the page authenticates itself against `/v1` with a bearer token in `sessionStorage`, so `publicPaths` stays at three entries and there is no cookie/CSRF surface. Scope is frozen at sign-in / list / add / toggle / read — a richer UI belongs in `apps/desktop`, not here.

### Desktop (apps/desktop/)

A Wails v3 window over a **loopback HTTP surface** that proxies `/v1` to the
configured remote server. It is a presentation layer like the CLI: it never runs
a dox server, never opens SQLite, and keeps no domain cache.

```
main.go                    window / tray / notifications / headless -serve mode
internal/proxy/            /v1 + /healthz → remote server, injects the bearer
internal/server/           /__dox/* control plane (session, prefs, SSE) + bundle
internal/store/            server URL, identity, UI prefs; JWT in the OS keychain
internal/feed/             reminder ledger poller → native notifications
frontend/                  React + Vite; imports @dox/core/browser, never bindings
packaging/Info.plist       macOS bundle manifest (__VERSION__ is substituted)
```

Non-obvious decisions, in order of importance:

1. **The webview talks to its own Go backend, not to the server.** `/v1/...` is
   reverse-proxied, so the UI is same-origin with itself: the dox server needs
   no CORS middleware, no cookie, and no change to its auth allowlist. The proxy
   is also the only place the JWT exists in Go — it is stored in the keychain and
   injected per request, so the renderer never holds the credential.
2. **One transport, no Wails bindings.** Everything the UI needs is HTTP
   (`/v1` proxied, `/__dox/*` for session/prefs/events), so the whole app can be
   driven in a browser with `just desktop-dev`. Deep links and reminder taps
   reach the UI over SSE (`GET /__dox/events`), not the Wails bridge.
3. **The frontend is a build artifact.** `apps/desktop/dist` is embedded with
   `//go:embed`, so `just desktop-frontend` (or any recipe that depends on it)
   must run before `go build`/`go test` in that module.
4. **macOS notifications require an .app bundle.** `UNUserNotificationCenter`
   aborts the process with an uncatchable ObjC exception when the binary runs
   outside a bundle, so `notificationsUsable()` skips notification setup instead
   of crashing. `just desktop-build` produces the signed .app.

Commands: `just desktop-dev` (headless UI + backend), `just desktop-frontend`
(bundle), `just desktop-build` (signed `apps/desktop/bin/Dox.app`),
`just desktop-test`.

### Database

SQLite, via sqlc, with goose-style migrations.

- Schema: `internal/db/migrations/*.sql`
- Hand-written queries: `internal/db/queries/*.sql`
- Generated Go: `internal/db/queries/*.sql.go` + `models.go` (regenerated by `just gen`)
- Column overrides live in `apps/server/sqlc.yaml` (e.g. `todos.done` and `projects.archived` map to Go `bool` since SQLite has no native bool)

IDs are ULIDs (`oklog/ulid/v2`). Timestamps are `int64` unix milliseconds. Inbox = `project_id IS NULL`.

Deadlines: `todos.due_at` (the deadline), `todos.remind_at` (the ping instant, NULL = at `due_at`), `todos.due_all_day` + `todos.due_zone` (calendar date + display zone; an all-day todo without an explicit `remind_at` never fires). `notifications` is a delivery ledger keyed `UNIQUE (user_id, todo_id, kind, scheduled_for)` — rows are written only when a reminder fires, so editing a deadline self-invalidates and re-running a sweep is a no-op.

### Client (apps/cli/, packages/core/)

`apps/cli/src/index.ts` is the entry: if invoked on a TTY with no subcommand, launches the Ink TUI; otherwise dispatches to `commander` subcommands. CLI commands and TUI components both call into `packages/core`, which holds the typed HTTP client, the `~/.config/dox/config.toml` reader/writer, and resource SDKs (`auth/`, `todo/`, `project/`, `invite/`, `event/`, `user/`, `notifications/`). Due/remind input strings ("2026-11-05", "09:30", "+2h") are parsed by one shared module, `packages/core/src/time/` — never re-implement that parsing in a view.

Onboarding is non-obvious: read **`docs/onboarding.md`** before touching anything under `apps/cli/src/tui/components/Onboarding.tsx` or the auth handlers. The state machine, why the branch picker is always shown, and the reauth path are all documented there.

## Constraints worth remembering

- **RPC is grpc-gateway + HTTP/JSON. Do not propose Connect-RPC** (see `dox-rpc-decision` memory).
- **Generated code is gitignored.** If a `apps/server/gen/...` or `packages/proto-gen/src/dox/...` import looks missing, run `just gen` — don't try to commit the generated files or edit them.
- **Thin client.** The CLI/TUI does not cache server state; every action hits the server. Don't add a local cache layer.
- **The desktop app must not import `apps/server`.** Its Go module has no dependency on the server module, which is what structurally prevents a bundled server (and a second source of truth) from creeping in. Keep the proxy generic HTTP; hand-write the few response structs the reminder poller needs.
- **The JWT never reaches JavaScript in the desktop app.** It lives in the OS keychain and is injected by the proxy; `/__dox/session` returns identity only. Do not add a binding or endpoint that hands the token to the webview.
- **Auth public-path allowlist is the security boundary.** Adding a new public endpoint means editing `publicPaths` in `authn/middleware.go` deliberately — anything not in that map requires a JWT.
- **The web UI owns exactly two public routes.** `webui.Handler` is mounted as `GET /{$}` and `GET /static/`; everything else falls through to the auth-wrapped gateway. Do not add a catch-all or an index fallback there, and do not grow `internal/webui/static` past its frozen scope.
- **Status codes carry meaning** (`authz/authz.go` docstring): NotFound vs PermissionDenied is a deliberate existence-leak control, not interchangeable.
- **Bus messages and DB mutations must be tx-bound** — call `bus.Publish` from inside `runInTx` with the tx-bound `*queries.Queries`, never from outside the transaction.
- **`emit_empty_slices: true`** is set in `sqlc.yaml` — sqlc list results are non-nil empty slices, not `nil`. Handlers and tests rely on this.
- **Releases ship server and CLI from a single tag.** `just release vX.Y.Z` pushes the tag and CI does the rest in parallel jobs: (1) Linux amd64/arm64 server binaries → tarballs on a draft GH Release, (2) multi-arch Docker image → Docker Hub, (3) `apps/cli` bundled via `bun build --target=node` → `npm publish` as `@l1nsn0w/dox` (see `scripts/build-cli.ts` and the `publish-npm` job in `release.yml`). The CLI version is injected at compile time via `--define` from `apps/cli/src/version.ts`, so `dox --version` reports the tag.

## Notes for changes

- Adding a new RPC: edit the relevant `proto/dox/v1/*.proto`, run `just gen`, implement the handler in `apps/server/internal/handler/`, decide if it's public (add to `publicPaths`) or auth-required, then wire the client SDK in `packages/core/src/<resource>/`.
- Adding a new schema change: write a new migration in `internal/db/migrations/`, add queries in `internal/db/queries/*.sql`, run `just gen`. Migrations run automatically on `db.Open`.
- Adding a new activity verb: see the `bus/` description above — three small edits, no handler changes elsewhere.
- Adding an out-of-band reminder channel (mail, webhook, ntfy): implement `notifier.Deliverer` and pass it to `notifier.New(...)` in `app.go`. The in-app channel needs nothing — clients poll `ListNotifications`.
- Before opening a PR, run `just check && just test`. `just check` runs proto-lint, gofmt, go vet, golangci-lint, prettier, eslint, and tsc in one pass and prints a summary table.

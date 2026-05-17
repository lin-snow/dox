# dox

A self-hosted personal todo. **Go** server (grpc-gateway + sqlc + SQLite) and a
**TypeScript** Ink TUI / CLI client. The server is the single source of truth;
the client is thin and doesn't cache.

Multiple users can share one server with project-level collaboration:
- The first user to register becomes the **owner**.
- Default registration is **invite-only**; the owner can flip a setting to
  allow open registration.
- Every user has a private **Inbox** (their `project_id IS NULL` todos).
- Projects are explicit entities; owners can invite collaborators as
  **editors** (read + write todos) or **viewers** (read-only).

## Quick start

```bash
# Server
just generate          # regenerate proto + ts types
just server-sqlc       # regenerate Go DB bindings
just server-dev        # start server (env DOX_DB_PATH/DOX_LISTEN_ADDR optional)

# Client — first run makes you the owner
bun run apps/cli/src/index.ts register --server http://localhost:8080 --name alice --device laptop

# Create a project and invite a friend
bun run apps/cli/src/index.ts project create "Family"
bun run apps/cli/src/index.ts project invite <project-id> --role editor
# share the code; the friend runs:
#   bun run apps/cli/src/index.ts accept <code> --server http://localhost:8080

# Open registration if you want anyone to join without invite (owner only)
bun run apps/cli/src/index.ts server set-registration true
```

## Client commands

```
dox register --server <url> [--name X --device Y --invite CODE]   # create a new account
dox login    --server <url>                                       # pair THIS device with an existing account
dox accept   <code> [--server <url>]                              # join a project (or register, if not logged in)

dox list [--project <id|inbox|all>]    dox add <title> [--project ...]
dox done <id>   dox undone <id>   dox edit <id> --title ...   dox rm <id>

dox project list | create <name> | rename <id> <name> | archive <id> | rm <id>
dox project invite <id> [--role editor|viewer]
dox project members <id> | member-rm <projectId> <userId>

dox device pair --name <device>   dox device list   dox device revoke <id>

dox server me | users | invite [--ttl-ms N] | set-registration <true|false>
```

## Architecture (non-obvious bits)

- **proto** under `proto/dox/v1/` is the single cross-process contract: five
  services (`AuthService`, `UserService`, `ProjectService`, `InviteService`,
  `TodoService`). `int64` timestamps in unix milliseconds; ULID strings for IDs.
- The server's **auth middleware** does one thing: looks up `Authorization: Bearer`
  in `device_tokens` (JOIN users), injects `Caller{UserID, Role, ...}` into the
  request context. Two paths are public: `/v1/auth/register` and `/v1/auth/redeem`.
- **Visibility** is enforced inside service handlers via tiny `authz` helpers
  (`CanReadProject`, `CanWriteProjectTodos`, `CanAdminProject`). Non-member
  reads return `NotFound`; non-member writes return `PermissionDenied`.
- **Invites** are one table with optional `project_id`; redeeming a server
  invite goes through `Register` (creates user + maybe joins project), a
  project invite for an existing user goes through `InviteService.AcceptInvite`.
- Pairing codes are **same-user only** ("add another device" flow), with
  `user_id` stamped on the row.

## Upgrading (pre-1.0)

There is no schema-migration story across the 2026-05 multi-tenant rewrite.
If you have a pre-multi-tenant `dev.db`, remove it before starting the
upgraded server: `rm dev.db`.

## Layout

```
proto/dox/v1/             *.proto contracts (auth, user, project, invite, todo)
apps/server/              Go server
  cmd/dox-server/main.go  entry: load config, run HTTP server
  internal/auth/          AuthService + middleware + Verifier + pairing code/token primitives
  internal/user/          UserService (me, list, devices, settings)
  internal/project/       ProjectService (CRUD + members)
  internal/invite/        InviteService (create + accept)
  internal/todo/          TodoService (project-scoped, Inbox-aware)
  internal/authctx/       Caller context wiring (read by every handler)
  internal/authz/         CanRead/Write/AdminProject helpers
  internal/settings/      registration_open KV wrapper
  internal/db/migrations/ goose .sql (append-only)
  internal/db/queries/    sqlc .sql + generated Go
  internal/httpserver/    grpc-gateway mux + lifecycle
apps/cli/                 TS Ink TUI + CLI
packages/core/            @dox/core: clients, config, fetcher middleware
packages/proto-gen/       generated TS message types
```

## License

AGPL-3.0

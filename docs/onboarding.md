# Onboarding flow

How a fresh dox client gets connected to a dox server. Covers both the TUI
(`dox` with no args on a TTY) and the equivalent CLI commands.

## Goal

When a user runs `dox` on a new machine, exactly one of four things is true:

| Situation | Branch |
|---|---|
| The server has no users yet | **first-user** — caller becomes owner |
| The user already has an account on that server | **login** |
| The user is new to the server, has an invite code | **register-with-invite** |
| The user is new to the server, registration is open | **register-open** |

Onboarding's job is to pick the right branch with the fewest user
keystrokes and the least jargon. The user should never have to know what an
"invite code" vs "pairing code" is, or whether registration is open — those
are server-side details the UI hides.

## What the server tells us

Before any credentials are collected, the client probes the server via the
public RPC `AuthService.ServerInfo` (`/v1/auth/server-info`). Response shape:

```ts
{
  hasUsers:          boolean   // false → first-user path
  registrationOpen:  boolean   // affects register path's need for invite
  version, commit:   string    // build identity for CLI/server skew warnings
  serverName:        string    // owner-set display name, empty until configured
  serverDescription: string    // owner-set one-liner
  ownerName:         string    // JOINed from settings.server_owner_id → users
}
```

Two of these route the flow; the rest are purely for the UI to display
"joining: Alice's Dox · by alice" so the user knows *whose* server they're
about to connect to.

Source: `apps/server/internal/handler/user.go` (`ServerInfo`),
`packages/core/src/auth/index.ts` (`fetchServerInfo`).

## State machine (TUI)

```
                  ┌─────────────┐
                  │   server    │  user types URL
                  └──────┬──────┘
                         │
                  ┌──────▼──────┐
                  │   probing   │  fetchServerInfo
                  └──────┬──────┘
              ┌──────────┴──────────┐
              │                     │
       hasUsers==false       hasUsers==true
              │                     │
              ▼                     ▼
      intent=first-user      ┌──────────────┐
              │              │ choose-branch│  press 1 or 2
              │              └──┬──────┬────┘
              │                 │      │
              │           ① login    ② register
              │                 │      │
              │                 │      ▼
              │                 │   ┌──────────────────┐
              │                 │   │   enter-invite   │
              │                 │   │  (only if        │
              │                 │   │   !registrationOpen)
              │                 │   └────────┬─────────┘
              │                 │            │
              └─────┬───────────┴────────────┘
                    ▼
            ┌──────────────────┐
            │  enter-username  │
            └────────┬─────────┘
                     ▼
            ┌──────────────────┐
            │  enter-password  │
            └────────┬─────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   intent=login           intent=register or
        │                 intent=first-user
        │                         │
        │                         ▼
        │              ┌──────────────────┐
        │              │ confirm-password │
        │              └────────┬─────────┘
        │                       │
        │            ┌──────────┴──────────┐
        │            │                     │
        │     intent=register      intent=first-user
        │            │                     │
        │            │                     ▼
        │            │          ┌──────────────────────┐
        │            │          │  enter-server-name   │  (Enter on empty to skip)
        │            │          └──────────┬───────────┘
        │            │                     ▼
        │            │          ┌────────────────────────┐
        │            │          │ enter-server-description│ (Enter on empty to skip)
        │            │          └──────────┬─────────────┘
        │            │                     │
        └────────────┴─────────────────────┘
                     ▼
             ┌──────────────┐
             │  submitting  │  POST /v1/auth/login or /v1/auth/register
             └──────┬───────┘
                    │
                    ▼
             saveConfig + onDone(cfg)
```

Source: `apps/cli/src/tui/components/Onboarding.tsx` (`Stage`, `Intent`).

## The three intents

### `first-user`

The server has no users. The caller will be the **owner**.

- No branch picker — there's nothing to log in to.
- Username + password collected.
- After password confirmation, optional `server_name` / `server_description`
  are prompted; submit an empty value (just press Enter) to skip either.
  Both can be set later via `dox server set-name` / `set-description`.
- `Register` request: server runs in a single best-effort sequence —
  inserts the user with `role=owner`, upserts `settings.server_owner_id`,
  upserts the optional identity fields, seeds three onboarding example
  todos into the new owner's Inbox.

### `login`

The server has users; the caller already has an account.

- Username + password.
- `POST /v1/auth/login` returns a JWT.
- Use this branch when reinstalling on a known server, when adding a second
  machine to your account, or any time the credentials already exist on the
  server side.

### `register`

The server has users; the caller is new to it.

- If `registrationOpen=false` → invite code prompt first.
- Username + password (with confirm).
- `POST /v1/auth/register` with `invite_code` if present. If the invite
  carried a `project_id`/`role`, the user is added to that project in the
  same request.

## Why we always show the branch picker

Earlier the routing was:

```ts
if (!hasUsers || registrationOpen) → straight to register
else                                → choose-branch
```

This had a silent bug: a returning user reinstalling on **their own** server
that happens to have `registrationOpen=true` got auto-routed into Register
and silently created a duplicate account. The user never saw a choice.

The correct rule: `registrationOpen` controls whether the **register** path
needs an invite, **not** whether the user is logging in or registering. The
two questions are orthogonal.

Current routing:

```ts
if (!hasUsers) → intent="first-user", straight to username
else           → choose-branch (always)
```

## ContextStrip

Above the active panel, every confirmed value so far is shown as a chip:

- `server: <url>` — once URL is entered
- `joining: <serverName> · by <ownerName>` — after probe, if `hasUsers`
- `mode: first user → owner` — after probe, if `!hasUsers`
- `registration: open | invite-only` — after probe, if `hasUsers`
- `invite: <code>` — after invite is entered
- `user: <username>` — after username is entered

Purpose: at any point in the wizard the user can see *exactly* what they've
committed to so far, and whose server they're joining. Eliminates "wait,
am I on the right server?" confusion before they type a password.

## What ends up on disk

On success, `saveConfig` writes `~/.config/dox/config.toml`:

```toml
server     = "https://dox.example.com"
token      = "<JWT>"
user_id    = "01J..."
user_name  = "alice"
role       = "owner"  # cached locally so TUI can gate owner-only UI;
                      # server stays authoritative
```

No `device_id`. The JWT itself carries `sub` (user_id), `name`, `role` —
the client could derive most of this by base64-decoding the token, but we
mirror it into the file so cold-start TUI rendering doesn't need to parse
the token first.

Source: `packages/core/src/config/index.ts`.

## Reauth path

If the local config file exists but its token is rejected by the server
(JWT expired, secret rotated via `DOX_JWT_SECRET`, or user deleted), the
TUI re-enters Onboarding with `reason: "reauth"` and the intro line
changes from "welcome — let's get you connected." to "your saved login
was rejected — let's reconnect."

The flow itself is identical to a fresh install. The user usually picks
**login** (their account still exists; just need a new token). The
distinction matters only because `reauth` users should not be confused
into thinking their account is gone.

Token validity is probed by `checkToken()` against `/v1/me` before mounting
the App; a 401/403 routes to onboarding, anything else (network, 5xx) lets
the App boot and surface a transient error in-band.

Source: `apps/cli/src/tui/index.tsx` (`runTui`),
`packages/core/src/auth/index.ts` (`checkToken`).

## CLI parity

The TUI is the primary entry point on a TTY, but every action it performs
is available as a non-interactive CLI command:

| TUI stage | CLI equivalent |
|---|---|
| Whole first-user flow | `dox register --server <url> --name <n> --password <p>` |
| Whole login flow | `dox login --server <url> --name <n> --password <p>` |
| Register with invite | `dox register --server <url> --invite <code>` |
| Accept-as-existing-user | `dox accept <code>` (uses current config) |
| Accept-as-new-user | `dox accept <code> --server <url>` (no config) |
| Set server identity later | `dox server set-name <name>` / `set-description <desc>` |
| Owner-mediated password recovery | `dox server reset-password <user-name>` |

`dox accept <code>` is the smart fall-through entry: if a config exists it
just calls `AcceptInvite` on the current server; if not, it pivots into
`registerCmd` and passes the invite through. Same code, both audiences.

Source: `apps/cli/src/cli/auth.ts`, `apps/cli/src/index.ts`.

## Edge cases and how the UI handles them

| Condition | Behavior |
|---|---|
| Server unreachable during probe | error chip below panel; stage rolls back to `server` |
| Login wrong password | uniform `"invalid username or password"` (no user-enum leak); UI drops back to `enter-password` |
| Register short password | UI rejects locally before submit (`< 8 chars`) — saves a round trip |
| Confirm-password mismatch | UI rejects locally; stays on `confirm-password` |
| Register with already-taken username | server returns `AlreadyExists`; UI drops back to `confirm-password` with the message |
| Register with invalid/expired/used invite | server returns `NotFound`; UI drops back to whichever input stage corresponds to the intent |
| Network failure mid-submit | error surfaced via `ErrorAlert`; user retries from the same stage |

## Why no email / OAuth / recovery codes

Dox is a self-hosted single-binary application. The auth model trades a
few capabilities for zero external dependencies:

- **No password reset by email.** Owners run `dox server reset-password
  <user>` to mint a one-time temp password and relay it out-of-band. Fits
  the small-team, family-server use case dox is built for.
- **No OAuth / SSO.** Not relevant for self-hosted.
- **No 2FA.** Could add TOTP later if anyone asks.
- **No recovery codes at register time.** Owner-mediated reset is the
  documented recovery path.

These are explicit non-goals; revisit if user feedback says otherwise.

## Files

| File | Role |
|---|---|
| `apps/cli/src/tui/components/Onboarding.tsx` | The stage machine described above |
| `apps/cli/src/tui/index.tsx` | Mount point; runs `checkToken` and decides `fresh` vs `reauth` |
| `apps/cli/src/cli/auth.ts` | Non-interactive equivalents (`registerCmd`, `loginCmd`, `acceptInviteCmd`, `logoutCmd`, `passwdCmd`) |
| `apps/server/internal/handler/user.go` | Server-side `ServerInfo` / `Register` / `Login` |
| `packages/core/src/auth/index.ts` | Client SDK: `fetchServerInfo`, `register`, `login`, `acceptInvite`, `checkToken` |
| `packages/core/src/config/index.ts` | `~/.config/dox/config.toml` read/write |
| `proto/dox/v1/auth.proto` | RPC contract |

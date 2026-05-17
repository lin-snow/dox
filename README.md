# dox

A self-hosted todo — for one person, or a few.

A single Go binary on your server, a thin TUI client on your laptop. The
server holds every byte of truth; the client never caches. Whoever registers
first becomes the owner and decides who else gets in.

## Deploy

The server is one container. One command, one persistent volume:

```bash
docker run -d --name dox \
  -p 8080:8080 \
  -v dox-data:/data \
  -e DOX_DB_PATH=/data/dox.db \
  ghcr.io/lin-snow/dox:latest
```

Or with `compose.yml`:

```yaml
services:
  dox:
    image: ghcr.io/lin-snow/dox:latest
    ports: ["8080:8080"]
    volumes: ["dox-data:/data"]
    environment:
      DOX_DB_PATH: /data/dox.db
    restart: unless-stopped

volumes:
  dox-data:
```

Optional env: `DOX_LISTEN_ADDR` (default `:8080`), `DOX_LOG_LEVEL`
(`debug` · `info` · `warn` · `error`), `DOX_EVENT_RETENTION` (Go duration,
e.g. `720h`), `DOX_JWT_SECRET` (base64; rotating it invalidates every paired
device).

## First run

```bash
# 1. Pair your device — first registrant becomes the owner
dox register --server http://your-server:8080 --name alice --device laptop

# 2. (optional) Share a project
dox project create "Family"
dox project invite <project-id> --role editor
#   they run:  dox accept <code> --server http://your-server:8080
```

Run `dox` on a TTY for the TUI, or use the subcommands below.

## Commands

| group | verbs |
|---|---|
| todos | `add` · `list` · `done` · `undone` · `edit` · `rm` |
| projects | `project list / create / rename / archive / rm` |
| members | `project invite / members / member-rm` |
| devices | `device pair / list / revoke` |
| server *(owner)* | `server me / users / invite / set-registration` |
| session | `register` · `login` · `accept <code>` |

`dox <command> --help` for the full signature.

## Stack

- **Server** — Go · grpc-gateway · sqlc · goose · SQLite
- **Client** — TypeScript · Ink · Bun
- **Contract** — `proto/dox/v1/` (auth, user, project, invite, todo)

IDs are ULID, timestamps are `int64` unix milliseconds, and only two routes
are public: `/v1/auth/register` and `/v1/auth/redeem`. Everything else needs
a device bearer token.

## Develop

```bash
just generate       # proto → Go + TS
just server-sqlc    # regenerate sqlc Go bindings
just serve          # run the server locally
just cli -- list    # run the CLI against the local server
```

See [`docs/onboarding.md`](docs/onboarding.md) for how the auth/onboarding
flow actually works.

## License

[AGPL-3.0](LICENSE)

# dox

> A quiet home for the things you need to do.

Self-hosted, so it's yours. On every device, so it's always there. Open to a
few, when you'd like the company. Small enough to forget you're running it.

![screenshot](./docs/imgs/screenshot.png)

## Deploy

The server is one container. One command, one persistent volume:

```bash
docker run -d --name dox \
  -p 6278:6278 \
  -v /opt/dox/data:/app/data \
  sn0wl1n/dox:latest
```

Or with Docker Compose — see [`docker/docker-compose.yml`](./docker/docker-compose.yml):

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Use

Install the client, then run it:

```bash
npm install -g @l1nsn0w/dox     # or: bun add -g @l1nsn0w/dox
dox
```

The TUI handles onboarding (register · login · accept invite) and everything
after.

## Dev

```bash
just gen            # proto → Go + TS, sqlc → Go DB bindings
just serve          # run the server locally
just cli            # run the CLI against the local server
```

> **Heads up:** dox is in early, active development — things will move and
> occasionally break between versions. Issues and pull requests warmly
> welcome at [github.com/lin-snow/dox](https://github.com/lin-snow/dox).

[AGPL-3.0](LICENSE)

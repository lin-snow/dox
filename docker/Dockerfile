# syntax=docker/dockerfile:1.7
#
# Consumes a pre-built dox-server binary at
#   artifacts/dox-server-${TARGETOS}-${TARGETARCH}
# relative to the build context. The release.yml workflow builds the
# binaries in a separate matrix job and downloads them here before
# `docker buildx build`.
#
# The binary is fully static (CGO_ENABLED=0) and embeds IANA tzdata via
# `import _ "time/tzdata"`, so we don't install `tzdata` here. The server
# only listens (no outbound HTTPS), so `ca-certificates` is also omitted —
# add it back at the point a feature actually needs it.
#
# Local equivalent:  just docker-build

FROM alpine:latest

ARG TARGETOS
ARG TARGETARCH

RUN mkdir -p /app/data

COPY artifacts/dox-server-${TARGETOS}-${TARGETARCH} /usr/local/bin/dox-server
RUN chmod +x /usr/local/bin/dox-server

# Default the SQLite path to /app/data so plain `docker run -v /host/path:/app/data`
# Just Works without -e overrides.
ENV DOX_DB_PATH=/app/data/dox.db

VOLUME ["/app/data"]
EXPOSE 6278

ENTRYPOINT ["/usr/local/bin/dox-server"]

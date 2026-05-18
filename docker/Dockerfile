# syntax=docker/dockerfile:1.7
#
# Consumes a pre-built dox-server binary at
#   artifacts/dox-server-${TARGETOS}-${TARGETARCH}
# relative to the build context. The release.yml workflow builds the
# binaries in a separate matrix job and downloads them here before
# `docker buildx build`.
#
# Local equivalent:  just docker-build

FROM alpine:latest

ARG TARGETOS
ARG TARGETARCH

# ca-certificates: outbound HTTPS readiness (future-proofing; the server today
# only listens, but a single layer adds <300 KB).
# tzdata: Go's time package falls back to /usr/share/zoneinfo when not running
# in UTC; shipping it avoids surprise Local() behavior on hosts with non-UTC TZ.
RUN apk add --no-cache ca-certificates tzdata \
 && mkdir -p /app/data

COPY artifacts/dox-server-${TARGETOS}-${TARGETARCH} /usr/local/bin/dox-server
RUN chmod +x /usr/local/bin/dox-server

# Default the SQLite path to /app/data so plain `docker run -v /host/path:/app/data`
# Just Works without -e overrides.
ENV DOX_DB_PATH=/app/data/dox.db

VOLUME ["/app/data"]
EXPOSE 6278

ENTRYPOINT ["/usr/local/bin/dox-server"]

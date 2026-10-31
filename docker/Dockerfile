
FROM alpine:latest

ARG TARGETOS
ARG TARGETARCH

RUN mkdir -p /app/data

COPY artifacts/dox-server-${TARGETOS}-${TARGETARCH} /usr/local/bin/dox-server
RUN chmod +x /usr/local/bin/dox-server

ENV DOX_DB_PATH=/app/data/dox.db

VOLUME ["/app/data"]
EXPOSE 6278

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:6278/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/dox-server"]

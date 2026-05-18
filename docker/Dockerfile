# syntax=docker/dockerfile:1.7

FROM alpine:latest

ARG TARGETOS
ARG TARGETARCH

RUN mkdir -p /app/data

COPY artifacts/dox-server-${TARGETOS}-${TARGETARCH} /usr/local/bin/dox-server
RUN chmod +x /usr/local/bin/dox-server

ENV DOX_DB_PATH=/app/data/dox.db

VOLUME ["/app/data"]
EXPOSE 6278

ENTRYPOINT ["/usr/local/bin/dox-server"]

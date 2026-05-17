# dox project tasks
# Run `just` to see all available recipes

default:
    @just --list

# === Codegen ===

# Generate Go + TS + OpenAPI from proto
generate:
    buf generate

# Lint proto
proto-lint:
    buf lint

# Check breaking changes vs main branch
proto-breaking:
    buf breaking --against '.git#branch=main'

# === Server ===

# Run go tests
server-test:
    cd apps/server && go test ./...

# Format Go source
server-fmt:
    cd apps/server && gofmt -s -w .

# Run sqlc to (re)generate db query Go code
server-sqlc:
    cd apps/server && sqlc generate

# Run server in dev mode (auto-generates DOX_BOOTSTRAP_TOKEN if not set)
server-dev:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${DOX_BOOTSTRAP_TOKEN:-}" ]; then
        export DOX_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
        echo ">>> Generated dev token: $DOX_BOOTSTRAP_TOKEN" >&2
        echo ">>> Use this with: bun run apps/cli/src/index.ts login --server http://localhost:8080" >&2
    fi
    export DOX_DB_PATH="${DOX_DB_PATH:-./data/dev.db}"
    export DOX_LISTEN_ADDR="${DOX_LISTEN_ADDR:-:8080}"
    cd apps/server && go run ./cmd/dox-server

# === Client ===

# Install Bun deps
install:
    bun install

# Run cli (pass args after --, e.g. `just cli -- login --server http://localhost:8080`)
cli *ARGS:
    bun run apps/cli/src/index.ts {{ARGS}}

# Run client tests
cli-test:
    bun test

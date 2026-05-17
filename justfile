# dox project tasks
# Run `just` to see all available recipes

# Pre-release version. Bump here when cutting a tag; release builds should
# override via the SERVER_VERSION env var (e.g. `SERVER_VERSION=v1.1.0 just serve`).
SERVER_VERSION := env_var_or_default("SERVER_VERSION", "v1.0.0")
VERSION_PKG := "github.com/lin-snow/dox/apps/server/internal/version"

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

# Run server with version/commit injected via -ldflags (defaults from config.go: ./apps/server/data/dox.db, :8080)
serve:
    #!/usr/bin/env bash
    set -euo pipefail
    commit=$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
    if ! git diff --quiet HEAD -- 2>/dev/null; then commit="${commit}-dirty"; fi
    date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    cd apps/server && go run \
        -ldflags "-X {{VERSION_PKG}}.version={{SERVER_VERSION}} -X {{VERSION_PKG}}.commit=${commit} -X {{VERSION_PKG}}.date=${date} -X {{VERSION_PKG}}.builtBy=just" \
        ./cmd/dox-server

# Build release binary into ./apps/server/bin/dox-server with version/commit injected
server-build:
    #!/usr/bin/env bash
    set -euo pipefail
    commit=$(git rev-parse --short=12 HEAD)
    if ! git diff --quiet HEAD --; then commit="${commit}-dirty"; fi
    date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    mkdir -p apps/server/bin
    cd apps/server && go build \
        -ldflags "-s -w -X {{VERSION_PKG}}.version={{SERVER_VERSION}} -X {{VERSION_PKG}}.commit=${commit} -X {{VERSION_PKG}}.date=${date} -X {{VERSION_PKG}}.builtBy=just" \
        -o bin/dox-server ./cmd/dox-server
    echo ">>> built apps/server/bin/dox-server ({{SERVER_VERSION}} ${commit})"

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

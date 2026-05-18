# dox project tasks
# Run `just` to see all available recipes

# Pre-release version. Bump here when cutting a tag; release builds should
# override via the SERVER_VERSION env var (e.g. `SERVER_VERSION=v1.1.0 just serve`).
SERVER_VERSION := env_var_or_default("SERVER_VERSION", "v1.0.0")
VERSION_PKG := "github.com/lin-snow/dox/apps/server/internal/version"

default:
    @just --list

# === Quality ===

# Run the full lint / format / typecheck pipeline (see scripts/check.sh).
check:
    bash scripts/check.sh

# Run all tests (Go + Bun).
test:
    cd apps/server && go test ./...
    bun test

# === Codegen ===

# Generate everything: proto → Go + TS + OpenAPI, and sqlc → Go DB bindings.
gen:
    buf generate
    cd apps/server && sqlc generate

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

# Run server with version/commit injected via -ldflags (defaults from config.go: ./apps/server/data/dox.db, :6278)
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

# Run cli (pass args after --, e.g. `just cli -- login --server http://localhost:6278`)
cli *ARGS:
    bun run apps/cli/src/index.ts {{ARGS}}

# Run client tests
cli-test:
    bun test

# Build the publishable npm bundle into apps/cli/dist/ (single-file, deps
# inlined). Use `DOX_CLI_VERSION=v0.1.0 just cli-build` to bake in a real
# version; without it the bundle reports "dev". CI runs the same script with
# DOX_CLI_VERSION = the pushed tag.
cli-build:
    bun run scripts/build-cli.ts

# === Docker ===

# Build the runtime Docker image locally end-to-end — mirrors what CI does
# (cross-compiles the binary for this host's arch into ./artifacts, then
# `docker build` consumes it). Tags the result `dox:local`.
docker-build:
    #!/usr/bin/env bash
    set -euo pipefail
    case "$(uname -m)" in
        x86_64|amd64)  arch=amd64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) echo ">>> unsupported arch: $(uname -m)" >&2; exit 1 ;;
    esac
    mkdir -p artifacts
    cd apps/server && CGO_ENABLED=0 GOOS=linux GOARCH=${arch} \
        go build -trimpath -ldflags="-s -w" \
        -o "$(git rev-parse --show-toplevel)/artifacts/dox-server-linux-${arch}" \
        ./cmd/dox-server
    cd "$(git rev-parse --show-toplevel)"
    docker build -f docker/Dockerfile -t dox:local \
        --build-arg TARGETOS=linux --build-arg TARGETARCH=${arch} .
    echo ">>> built dox:local (linux/${arch})"

# === Release ===

# Cut a release: tag the current commit and push it to trigger
# .github/workflows/release.yml (Docker Hub build & push).
# Usage:  just release v0.1.0
release VERSION:
    #!/usr/bin/env bash
    set -euo pipefail

    if ! [[ "{{VERSION}}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
        echo ">>> version must look like vMAJOR.MINOR.PATCH (e.g. v0.1.0)" >&2
        exit 1
    fi

    branch=$(git rev-parse --abbrev-ref HEAD)
    if [[ "$branch" != "main" ]]; then
        echo ">>> refusing to release from '$branch' — switch to main first" >&2
        exit 1
    fi

    if ! git diff --quiet HEAD -- 2>/dev/null; then
        echo ">>> working tree is dirty — commit or stash first" >&2
        exit 1
    fi

    git fetch --quiet origin main
    if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
        echo ">>> local main is not aligned with origin/main — push or pull first" >&2
        exit 1
    fi

    if git rev-parse "{{VERSION}}" >/dev/null 2>&1; then
        echo ">>> tag {{VERSION}} already exists" >&2
        exit 1
    fi

    sha=$(git rev-parse --short HEAD)
    echo ">>> about to tag ${sha} on main as {{VERSION}} and push to origin."
    echo ">>> this triggers release.yml → docker.io/<dockerhub-user>/dox:{{VERSION}}"
    read -r -p ">>> continue? [y/N] " ans
    [[ "$ans" =~ ^[yY]$ ]] || { echo ">>> aborted"; exit 1; }

    git tag -a "{{VERSION}}" -m "release {{VERSION}}"
    git push origin "{{VERSION}}"

    echo ">>> pushed {{VERSION}} — watch:"
    echo "    https://github.com/lin-snow/dox/actions/workflows/release.yml"

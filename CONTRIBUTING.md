# Contributing to dox

Thanks for your interest. dox is a small, opinionated self-hosted todo. We
keep the surface area intentionally narrow — please read this first so your
patch doesn't bounce on scope.

## What we accept

- Bug fixes with a clear repro.
- Polish on existing commands (better errors, UX, docs).
- Server / proto changes that **reduce** complexity or fix correctness.
- New tests, especially around auth, invites, and project visibility.

## What we usually decline

- Local-first / offline sync. dox is thin-client by design; the server is
  the only source of truth.
- Alternative RPC stacks (Connect-RPC, twirp, raw REST handwritten). The
  contract is `proto/dox/v1/` + grpc-gateway.
- OAuth, password login, email verification, JWT, RBAC engines. Auth is
  device bearer tokens + one-shot codes, and that's the whole story.
- New top-level features without an issue first. Open one and let's talk
  about scope before you write code.

## Dev setup

```bash
# One-time
bun install
just generate          # proto -> Go + TS
just server-sqlc       # sql -> Go

# Run
just server-dev        # http://localhost:8080
just cli -- register --server http://localhost:8080 --name alice --device laptop
```

You need: Go (1.22+), Bun, `buf`, `sqlc`, `goose`, `just`.

## Workflow

1. **Open an issue** for anything beyond a small fix.
2. Branch from `main`.
3. If you touch `proto/`, run `just generate` and commit the generated
   files. If you touch `internal/db/queries/`, run `just server-sqlc` and
   commit the result. CI rejects stale generated code.
4. Run `just server-test` and `just cli-test`. Add tests for new behavior;
   auth / authz changes without tests will not be merged.
5. `just server-fmt` before pushing.
6. Keep PRs focused. One logical change per PR. Squash-merge is the norm.

## Commit / PR style

- Conventional-ish: `feat(scope): …`, `fix(scope): …`, `refactor: …`.
- PR description should answer: what changed, why, and what you tested.
- If you change a public proto message, call it out — that's a breaking
  change for clients.

## License & DCO

dox is **AGPL-3.0**. By submitting a patch you agree your contribution is
licensed under AGPL-3.0. There is no separate CLA. Please add a
`Signed-off-by:` line to your commits (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/).

## Security issues

Please don't open public issues for security problems. See
[SECURITY.md](./SECURITY.md).

## Code of conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).
Be decent. Disagree on substance, not on people.

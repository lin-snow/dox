// Injected at build time via `bun build --define`. See `just cli-build` and
// the `publish-npm` CI job. Defaults make `bun run apps/cli/src/index.ts`
// readable in development without any env wiring.
export const VERSION = process.env.DOX_CLI_VERSION ?? "dev";
export const COMMIT = process.env.DOX_CLI_COMMIT ?? "unknown";

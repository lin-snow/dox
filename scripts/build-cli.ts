#!/usr/bin/env bun
//
// scripts/build-cli.ts — Produce a publish-ready CLI bundle at apps/cli/dist/.
//
// Output layout (everything `npm publish` needs and nothing it doesn't):
//   apps/cli/dist/dox.js          single-file bundle, all deps inlined
//   apps/cli/dist/package.json    minimal manifest, no workspace:* leaks
//   apps/cli/dist/README.md       npm page copy of the repo README
//
// Local sanity check:
//   DOX_CLI_VERSION=v0.1.0 bun run scripts/build-cli.ts
//   node apps/cli/dist/dox.js --version
//
// CI runs this with DOX_CLI_VERSION = github.ref_name (the pushed tag).

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const VERSION = process.env.DOX_CLI_VERSION ?? "dev";

function detectCommit(): string {
  if (process.env.DOX_CLI_COMMIT) return process.env.DOX_CLI_COMMIT;
  // Bun.spawnSync runs git directly (no shell), so the constant argv is
  // injection-safe by construction.
  const proc = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"]);
  if (proc.exitCode !== 0) return "unknown";
  return proc.stdout.toString().trim() || "unknown";
}
const COMMIT = detectCommit();

// npm versions must be plain semver — strip the leading "v". For non-release
// builds ("dev", branch names, …) fall back to 0.0.0-<sanitized> so the
// manifest is still valid even when run locally.
const NPM_VERSION = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(VERSION)
  ? VERSION.replace(/^v/, "")
  : `0.0.0-${VERSION.replace(/[^0-9A-Za-z.-]/g, "-")}`;

const DIST = "apps/cli/dist";
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Bun pulls ink's `await import('./devtools.js')` into the static graph even
// though it's gated on `process.env['DEV'] === 'true'` at runtime, which then
// drags in react-devtools-core (an optional peer dep we never install). A
// resolver plugin swaps that import for an empty default export so the
// devtools subgraph never enters the bundle.
const stubReactDevtoolsCore = {
  name: "stub-react-devtools-core",
  setup(builder: {
    onResolve: (
      filter: { filter: RegExp },
      fn: () => { path: string; namespace: string },
    ) => void;
    onLoad: (
      filter: { filter: RegExp; namespace: string },
      fn: () => { contents: string; loader: "js" },
    ) => void;
  }) {
    builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "stub",
      namespace: "stub-react-devtools",
    }));
    builder.onLoad({ filter: /.*/, namespace: "stub-react-devtools" }, () => ({
      contents: "export default {};",
      loader: "js",
    }));
  },
};

const result = await Bun.build({
  entrypoints: ["apps/cli/src/index.ts"],
  target: "node",
  outdir: DIST,
  naming: "dox.js",
  define: {
    "process.env.DOX_CLI_VERSION": JSON.stringify(VERSION),
    "process.env.DOX_CLI_COMMIT": JSON.stringify(COMMIT),
  },
  plugins: [stubReactDevtoolsCore],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Force the published shebang to Node regardless of what bun emitted from the
// source's `#!/usr/bin/env bun` — the bundle ships to npm where node executes
// it.
const bundlePath = `${DIST}/dox.js`;
const body = readFileSync(bundlePath, "utf8").replace(
  /^#!.*\n/,
  "#!/usr/bin/env node\n",
);
const final = body.startsWith("#!") ? body : `#!/usr/bin/env node\n${body}`;
writeFileSync(bundlePath, final);
chmodSync(bundlePath, 0o755);

// Hand-roll the publish manifest so workspace:* deps from apps/cli/package.json
// never reach the registry. Everything the CLI needs at runtime is already
// bundled into dox.js, so this manifest deliberately has no `dependencies`.
const manifest = {
  name: "@l1nsn0w/dox",
  version: NPM_VERSION,
  description: "Self-hosted personal todo — thin CLI/TUI client",
  type: "module",
  license: "AGPL-3.0",
  homepage: "https://github.com/lin-snow/dox",
  repository: {
    type: "git",
    url: "git+https://github.com/lin-snow/dox.git",
    directory: "apps/cli",
  },
  bugs: { url: "https://github.com/lin-snow/dox/issues" },
  keywords: ["todo", "self-hosted", "cli", "tui", "dox"],
  bin: { dox: "./dox.js" },
  files: ["dox.js", "README.md"],
  engines: { node: ">=20" },
  publishConfig: { access: "public" },
};
writeFileSync(`${DIST}/package.json`, JSON.stringify(manifest, null, 2) + "\n");

if (existsSync("README.md")) {
  copyFileSync("README.md", `${DIST}/README.md`);
}

console.log(
  `>>> built ${bundlePath} (${VERSION} ${COMMIT}) → npm version ${NPM_VERSION}`,
);

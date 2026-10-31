#!/usr/bin/env bun

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
  const proc = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"]);
  if (proc.exitCode !== 0) return "unknown";
  return proc.stdout.toString().trim() || "unknown";
}
const COMMIT = detectCommit();

const NPM_VERSION = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(VERSION)
  ? VERSION.replace(/^v/, "")
  : `0.0.0-${VERSION.replace(/[^0-9A-Za-z.-]/g, "-")}`;

const DIST = "apps/cli/dist";
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

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

const bundlePath = `${DIST}/dox.js`;
const body = readFileSync(bundlePath, "utf8").replace(
  /^#!.*\n/,
  "#!/usr/bin/env node\n",
);
const final = body.startsWith("#!") ? body : `#!/usr/bin/env node\n${body}`;
writeFileSync(bundlePath, final);
chmodSync(bundlePath, 0o755);

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
  bin: { dox: "dox.js" },
  files: ["dox.js", "README.md"],
  engines: { node: ">=26" },
  publishConfig: { access: "public" },
};
writeFileSync(`${DIST}/package.json`, JSON.stringify(manifest, null, 2) + "\n");

if (existsSync("README.md")) {
  copyFileSync("README.md", `${DIST}/README.md`);
}

console.log(
  `>>> built ${bundlePath} (${VERSION} ${COMMIT}) → npm version ${NPM_VERSION}`,
);

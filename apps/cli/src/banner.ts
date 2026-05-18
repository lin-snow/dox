import { COMMIT, VERSION } from "./version";

// Same 5-row figlet the TUI's Logo component and the server's version.Banner
// render. Keep these three in sync (see apps/cli/src/tui/components/layout/Logo.tsx
// and apps/server/internal/version/version.go) so dox has one visual identity.
const LOGO_ROWS = [
  "       __          ",
  "  ____/ /___  _  __",
  " / __  / __ \\| |/_/",
  "/ /_/ / /_/ />  <  ",
  "\\__,_/\\____/_/|_|  ",
] as const;

// ANSI: bold + magentaBright, matching theme.color.brand. Only emitted on a
// TTY so `dox --version | grep` and CI log scrapers stay clean.
const BRAND_ON = "\x1b[1;95m";
const ANSI_OFF = "\x1b[0m";

export function renderVersionBanner(): string {
  const color = process.stdout.isTTY;
  const lines: string[] = [""];
  for (const row of LOGO_ROWS) {
    lines.push(color ? `${BRAND_ON}${row}${ANSI_OFF}` : row);
  }
  lines.push("");
  lines.push(`  dox ${VERSION} (${COMMIT})`);
  lines.push("");
  return lines.join("\n");
}

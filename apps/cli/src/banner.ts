import { LOGO_FULL } from "./logo";
import { COMMIT, displayVersion, VERSION } from "./version";

const BRAND_ON = "\x1b[1;95m";
const ANSI_OFF = "\x1b[0m";

export function renderVersionBanner(): string {
  const color = process.stdout.isTTY;
  const version = displayVersion(VERSION) || "local";
  const commit = COMMIT === "unknown" ? "" : ` (${COMMIT})`;
  const lines: string[] = [""];
  for (const row of LOGO_FULL) {
    lines.push(color ? `${BRAND_ON}${row}${ANSI_OFF}` : row);
  }
  lines.push("");
  lines.push(`  dox ${version}${commit}`);
  lines.push("");
  return lines.join("\n");
}

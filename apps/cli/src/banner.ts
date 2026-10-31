import { COMMIT, VERSION } from "./version";

const LOGO_ROWS = [
  "       __          ",
  "  ____/ /___  _  __",
  " / __  / __ \\| |/_/",
  "/ /_/ / /_/ />  <  ",
  "\\__,_/\\____/_/|_|  ",
] as const;

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

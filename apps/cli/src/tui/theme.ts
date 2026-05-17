// Visual tokens for the TUI. Keep this file the single source of truth for
// colors, glyphs, and key-hint formatting so the whole UI stays coherent.
//
// Palette is neon-on-dark, inspired by SurgeDM: magenta primary, cyan accent,
// with green for "success / done" so completion still reads clearly.

export const color = {
  // primary brand & focus — anything "where the user is" uses this
  accent: "magentaBright",
  // secondary accent — used for stats, identity, leading lines
  accent2: "cyanBright",
  // muted dimmer accent for secondary callouts (e.g. swatches, counts)
  accent3: "magenta",
  success: "greenBright",
  warn: "yellow",
  danger: "redBright",
  muted: "gray",
  // brand line in the logo
  brand: "magentaBright",
  brandAlt: "cyanBright",
} as const;

export const icon = {
  brand: "◆",
  open: "○",
  done: "✓",
  selectBar: "▎",
  stepDone: "●",
  stepActive: "◉",
  stepPending: "○",
  stepLink: "─",
  bullet: "•",
  dot: "·",
  chevron: "›",
  spinner: "◐",
  // power-on / connection indicator used in the header strip
  on: "●",
} as const;

// Format a single key-hint chip: `[key] label`.
export function keyHint(key: string, label: string): string {
  return `[${key}] ${label}`;
}

// Join key hints with a thin separator.
export function keyHints(
  pairs: ReadonlyArray<readonly [string, string]>,
): string {
  return pairs.map(([k, l]) => keyHint(k, l)).join("  ");
}

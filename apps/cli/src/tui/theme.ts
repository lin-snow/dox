export const color = {
  accent: "magentaBright",
  accent2: "cyanBright",
  accent3: "magenta",
  success: "greenBright",
  warn: "yellow",
  danger: "redBright",
  muted: "gray",
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
  on: "●",
} as const;

export function keyHint(key: string, label: string): string {
  return `[${key}] ${label}`;
}

export function keyHints(
  pairs: ReadonlyArray<readonly [string, string]>,
): string {
  return pairs.map(([k, l]) => keyHint(k, l)).join("  ");
}

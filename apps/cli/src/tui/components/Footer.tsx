import { Box, Text, useStdout } from "ink";

import { color, icon } from "../theme";

interface FooterProps {
  mode: string;
  version?: string;
  hints: ReadonlyArray<readonly [string, string]>;
  // Extra outer padding the parent already applied; we subtract it from the
  // available width so the right-side content never overflows onto a 2nd row.
  outerPadX?: number;
}

// Bottom-of-screen status strip. Visual hierarchy:
//   ─── dash filler ────  ⏎ open · ␣ toggle · …    ┃ NORMAL ┃   ◆ dox v0.0.0
//                          ↑ keys in accent           ↑ inverse   ↑ brand glyph
//                            labels in muted            mode       in 2-tone
//                            `·` separators
export function Footer({ mode, version, hints, outerPadX = 0 }: FooterProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  // Plain-text length used to size the dash run. Mirror the visible cells of
  // the right-side cluster precisely; the renderer below uses the same content.
  // Per-hint cells: `<key> <label>` + a 4-cell separator (`  · `) between
  // chips. Must match the actual rendered output below; off-by-one here wraps
  // the last token (`dox v0.0.0`) onto a second row.
  const hintLen = hints.reduce(
    (acc, [k, l], idx) => acc + (idx > 0 ? 4 : 0) + k.length + 1 + l.length,
    0,
  );
  const modeCell = ` ${mode.toUpperCase()} `;
  // Version shown only when the terminal is wide enough; on narrow widths the
  // hint chips + mode pill take priority over decorative branding. The user
  // can always check version in the Status panel.
  const brandCell = version ? `  ${icon.brand} dox` : "";
  const visibleRightLen = 2 + hintLen + 4 + modeCell.length + brandCell.length;
  // Safety margin: some unicode glyphs (e.g. ◆, ␣) measure as 2 cells in
  // BiDi-aware terminals, so .length undercounts the rendered width.
  const SAFETY = 2;
  const dashes = Math.max(3, cols - visibleRightLen - 2 - outerPadX * 2 - SAFETY);

  return (
    <Box paddingX={1} marginTop={1}>
      <Text>
        <Text color={color.muted}>{"─".repeat(dashes)}</Text>
        <Text color={color.muted}>{"  "}</Text>
        {hints.map(([k, l], idx) => (
          <Text key={k}>
            {idx > 0 ? <Text color={color.muted} dimColor>{`  ${icon.dot} `}</Text> : null}
            <Text color={color.accent} bold>
              {k}
            </Text>
            <Text color={color.muted}>{` ${l}`}</Text>
          </Text>
        ))}
        <Text>{"    "}</Text>
        <Text color={color.accent} inverse bold>
          {modeCell}
        </Text>
        {version && (
          <Text>
            <Text color={color.muted}>{"  "}</Text>
            <Text color={color.accent2} bold>{icon.brand}</Text>
            <Text color={color.accent2}> dox</Text>
          </Text>
        )}
      </Text>
    </Box>
  );
}

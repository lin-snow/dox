import { Box, Text, useWindowSize } from "ink";

import { color, icon } from "../../theme";

interface FooterProps {
  mode: string;
  version?: string;
  hints: ReadonlyArray<readonly [string, string]>;
  outerPadX?: number;
}

const POWERED_BY = "powered by dox";

export function Footer({ mode, version, hints, outerPadX = 0 }: FooterProps) {
  const { columns: cols } = useWindowSize();

  const hintLen = hints.reduce(
    (acc, [k, l], idx) => acc + (idx > 0 ? 4 : 0) + k.length + 1 + l.length,
    0,
  );
  const modeCell = ` ${mode.toUpperCase()} `;
  const brandCell = version ? `  ${icon.brand} dox` : "";
  const leftLen = POWERED_BY.length + 2;
  const visibleRightLen = 2 + hintLen + 4 + modeCell.length + brandCell.length;
  const SAFETY = 2;
  const dashes = Math.max(
    3,
    cols - leftLen - visibleRightLen - 2 - outerPadX * 2 - SAFETY,
  );

  return (
    <Box paddingX={1} marginTop={1}>
      <Text>
        <Text color={color.muted} dimColor>
          {POWERED_BY}
        </Text>
        <Text color={color.muted}>{"  "}</Text>
        <Text color={color.muted}>{"─".repeat(dashes)}</Text>
        <Text color={color.muted}>{"  "}</Text>
        {hints.map(([k, l], idx) => (
          <Text key={k}>
            {idx > 0 ? (
              <Text color={color.muted} dimColor>{`  ${icon.dot} `}</Text>
            ) : null}
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
            <Text color={color.accent2} bold>
              {icon.brand}
            </Text>
            <Text color={color.accent2}> dox</Text>
          </Text>
        )}
      </Text>
    </Box>
  );
}

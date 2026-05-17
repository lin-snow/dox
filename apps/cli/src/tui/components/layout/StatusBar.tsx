import { Box, Text } from "ink";

import { color, icon } from "../../theme";

interface StatusBarProps {
  mode: string;
  modeColor?: string;
  left?: string;
  hints: ReadonlyArray<readonly [string, string]>;
}

// Bottom-of-screen mode + key hint strip. The mode pill is reverse-video so the
// active context is unmistakable at a glance.
export function StatusBar({
  mode,
  modeColor = color.accent,
  left,
  hints,
}: StatusBarProps) {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text color={modeColor} inverse>
        {" "}
        {mode.toUpperCase()}{" "}
      </Text>
      {left && (
        <Text color={color.muted}>
          {"  "}
          {icon.dot} {left}
        </Text>
      )}
      <Box flexGrow={1} />
      {hints.map(([k, l], idx) => (
        <Text key={k} color={color.muted}>
          {idx > 0 ? "  " : ""}
          <Text color={color.accent}>{k}</Text> {l}
        </Text>
      ))}
    </Box>
  );
}

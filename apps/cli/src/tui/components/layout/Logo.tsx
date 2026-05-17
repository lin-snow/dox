import { Box, Text } from "ink";

import { color } from "../../theme";

// 5-row "dox" figlet (slant font) — matches the server's startup banner in
// apps/server/internal/version/version.go so the CLI/TUI and server share one
// visual identity. Each line is exactly 19 cells wide.
const ROWS = [
  "       __          ",
  "  ____/ /___  _  __",
  " / __  / __ \\| |/_/",
  "/ /_/ / /_/ />  <  ",
  "\\__,_/\\____/_/|_|  ",
] as const;

export function Logo() {
  return (
    <Box flexDirection="column">
      {ROWS.map((row, idx) => (
        <Text key={idx} color={color.brand} bold>
          {row}
        </Text>
      ))}
    </Box>
  );
}

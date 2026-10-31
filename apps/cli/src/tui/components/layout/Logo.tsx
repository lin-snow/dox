import { Box, Text } from "ink";

import { color } from "../../theme";

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

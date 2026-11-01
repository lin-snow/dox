import { Box, Text } from "ink";

import { LOGO_FULL, LOGO_MARK } from "../../../logo";
import { color } from "../../theme";

export function Logo({ full = false }: { full?: boolean }) {
  const rows = full ? LOGO_FULL : LOGO_MARK;
  return (
    <Box flexDirection="column">
      {rows.map((row, idx) => (
        <Text key={idx} color={color.brand} bold>
          {row}
        </Text>
      ))}
    </Box>
  );
}

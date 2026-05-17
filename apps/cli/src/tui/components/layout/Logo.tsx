import { Box, Text } from "ink";

import { color } from "../../theme";

// 7-row "dox" figlet (slant font). Single brand color — gradients between rows
// read as "broken letter" in practice, not "neon".
//
// Encoded as a string array (not a template literal) because the source figlet
// uses both backtick and backslash characters; template literals would silently
// terminate on the first backtick. Each line is exactly 23 cells wide.
const ROWS = [
  "  __                   ",
  " /\\ \\                  ",
  " \\_\\ \\    ___   __  _  ",
  " /'_` \\  / __`\\/\\ \\/'\\ ",
  "/\\ \\L\\ \\/\\ \\L\\ \\/>  </ ",
  "\\ \\___,_\\ \\____//\\_/\\_\\",
  " \\/__,_ /\\/___/ \\//\\/_/",
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

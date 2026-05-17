import { Box, Text } from "ink";

import { color, icon } from "../../theme";

// Compact red banner shown above the status bar. Avoids @inkjs/ui's Alert so
// the visual language stays consistent with the rest of the chrome.
export function ErrorAlert({ message }: { message: string }) {
  return (
    <Box paddingX={1} marginTop={1}>
      <Text color={color.danger} inverse>
        {" "}
        {icon.bullet} error{" "}
      </Text>
      <Text color={color.danger}>
        {"  "}
        {message}
      </Text>
    </Box>
  );
}

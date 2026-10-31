import { Box, Text } from "ink";

import { color, icon } from "../../theme";

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

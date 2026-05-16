import { Box } from "ink";
import { Alert } from "@inkjs/ui";

export function ErrorAlert({ message }: { message: string }) {
  return (
    <Box marginTop={1}>
      <Alert variant="error">{message}</Alert>
    </Box>
  );
}

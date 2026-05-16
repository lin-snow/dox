import { Box, Text } from "ink";
import type { Mode } from "../state";

export function HelpBar({ mode }: { mode: Mode }) {
  if (mode === "list") {
    return (
      <Box marginTop={1}>
        <Text dimColor>
          j/k nav · space toggle · d delete · e edit · i add · r refresh · q quit
        </Text>
      </Box>
    );
  }
  const label = mode === "add" ? "Adding new todo" : "Editing todo";
  return (
    <Box marginTop={1}>
      <Text dimColor>{label} — Enter to save · empty + Enter to cancel</Text>
    </Box>
  );
}

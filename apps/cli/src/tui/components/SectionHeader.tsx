import { Box, Text } from "ink";

import { color } from "../theme";

interface SectionHeaderProps {
  title: string;
  // Optional subtitle / status chip rendered after the title in muted.
  hint?: string;
  // Width of the lead dash run before the title.
  leadWidth?: number;
}

// External panel label, rendered as `─── Title ─── hint ────────────────────`
// with the title in accent and the dashes in muted. The whole row is a single
// truncate-wrapped Text so it always fills the parent's width without flex
// measurement quirks wrapping the title onto a second line.
export function SectionHeader({ title, hint, leadWidth = 3 }: SectionHeaderProps) {
  const lead = "─".repeat(leadWidth);
  return (
    <Box>
      <Text wrap="truncate">
        <Text color={color.muted}>{lead} </Text>
        <Text bold color={color.accent}>{title}</Text>
        {hint && <Text color={color.muted}>{`  ·  ${hint}`}</Text>}
        <Text color={color.muted}>{` ${"─".repeat(200)}`}</Text>
      </Text>
    </Box>
  );
}

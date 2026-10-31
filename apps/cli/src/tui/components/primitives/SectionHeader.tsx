import { Box, Text } from "ink";

import { color } from "../../theme";

interface SectionHeaderProps {
  title: string;
  hint?: string;
  leadWidth?: number;
}

export function SectionHeader({
  title,
  hint,
  leadWidth = 3,
}: SectionHeaderProps) {
  const lead = "─".repeat(leadWidth);
  return (
    <Box>
      <Text wrap="truncate">
        <Text color={color.muted}>{lead} </Text>
        <Text bold color={color.accent}>
          {title}
        </Text>
        {hint && <Text color={color.muted}>{`  ·  ${hint}`}</Text>}
        <Text color={color.muted}>{` ${"─".repeat(200)}`}</Text>
      </Text>
    </Box>
  );
}

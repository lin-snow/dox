import { Box, Text } from "ink";

import { color } from "../../theme";

interface Stat {
  label: string;
  value: number | string;
  tone?: "primary" | "success" | "muted" | "accent2";
}

interface StatsPanelProps {
  stats: Stat[];
}

const TONE: Record<NonNullable<Stat["tone"]>, string> = {
  primary: color.accent,
  success: color.success,
  accent2: color.accent2,
  muted: color.muted,
};

// SurgeDM-style stat callouts. Each row is `LABEL …… VALUE` with the value
// bold + colored to pop. Vertical stack so it fits gracefully in a narrow
// sidebar column.
export function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <Box flexDirection="column">
      {stats.map((s) => (
        <Box key={s.label}>
          <Text color={color.muted}>{s.label.toUpperCase()}</Text>
          <Box flexGrow={1} />
          <Text bold color={TONE[s.tone ?? "primary"]}>
            {String(s.value)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

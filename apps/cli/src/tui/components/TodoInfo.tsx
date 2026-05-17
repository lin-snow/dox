import { Box, Text } from "ink";

import type { Project, Todo } from "@dox/core";

import { color, icon } from "../theme";
import { relativeTime, swatchColor } from "../util";

interface TodoInfoProps {
  todo: Todo | null;
  project: Project | null;
  // Owner display name. ULID fallback is fine when no lookup is wired yet.
  ownerName?: string;
  nowMs: number;
}

// Compact at-a-glance card for the cursored todo. Lives in the right-top
// panel; full Todo Detail page (Enter) carries the long-form view + the new
// description field.
export function TodoInfo({ todo, project, ownerName, nowMs }: TodoInfoProps) {
  if (!todo) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={color.muted} dimColor>
          no todo selected
        </Text>
      </Box>
    );
  }
  const statusIcon = todo.done ? icon.done : icon.open;
  const statusColor = todo.done ? color.success : color.accent;
  const statusLabel = todo.done ? "Done" : "Open";
  return (
    <Box flexDirection="column">
      {/* Status + short ID on one line — frees vertical space for body. */}
      <Box>
        <Text color={statusColor} bold>
          {statusIcon} {statusLabel}
        </Text>
        <Box flexGrow={1} />
        <Text color={color.muted} dimColor>
          {todo.id.slice(0, 8).toLowerCase()}…
        </Text>
      </Box>

      {/* Title: bold accent, single line with truncation. */}
      <Box marginTop={1}>
        <Text color={color.accent} bold wrap="truncate">
          {todo.title}
        </Text>
      </Box>

      {/* Metadata block: label column 9 cells, value truncates. */}
      <Box flexDirection="column" marginTop={1}>
        <InfoRow label="Project">
          {project ? (
            <Text>
              <Text color={swatchColor(project.color)}>● </Text>
              <Text>{project.name}</Text>
            </Text>
          ) : (
            <Text color={color.muted} dimColor>● inbox</Text>
          )}
        </InfoRow>
        <InfoRow label="By">
          <Text color={color.accent2}>{ownerName ?? todo.createdBy.slice(0, 8).toLowerCase() + "…"}</Text>
        </InfoRow>
        <InfoRow label="Created">
          <Text>{relativeTime(nowMs, todo.createdAt)} ago</Text>
        </InfoRow>
        <InfoRow label="Updated">
          <Text>{relativeTime(nowMs, todo.updatedAt)} ago</Text>
        </InfoRow>
      </Box>

      {/* Footer hint — kept inside the panel so users discover the detail
          page without reading the global footer. */}
      <Box marginTop={1}>
        <Text color={color.muted} dimColor>
          press <Text color={color.accent} bold>⏎</Text> for details
        </Text>
      </Box>
    </Box>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box width={9}>
        <Text color={color.muted}>{label}</Text>
      </Box>
      {children}
    </Box>
  );
}

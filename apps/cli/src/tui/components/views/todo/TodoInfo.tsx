import { Box, Text } from "ink";

import type { Project, Todo } from "@dox/core";
import { dueLabel, isOverdue } from "@dox/core";

import { renderMarkdown } from "../../primitives/Markdown";
import { color, icon } from "../../../theme";
import { relativeTime, swatchColor, windowLabel } from "../../../util";

interface TodoInfoProps {
  todo: Todo | null;
  project: Project | null;
  ownerName?: string;
  nowMs: number;
  panelWidth: number;
  panelHeight: number;
}

const BASE_FIXED_ROWS = 10;
const DESC_HEADER = 2;
const PANEL_CHROME = 4;

export function TodoInfo({
  todo,
  project,
  ownerName,
  nowMs,
  panelWidth,
  panelHeight,
}: TodoInfoProps) {
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

  const dueAt = todo.dueAt === undefined ? undefined : Number(todo.dueAt);
  const allDay = todo.dueAllDay ?? false;
  const remindAt =
    todo.remindAt === undefined ? undefined : Number(todo.remindAt);
  const startsAt =
    todo.startsAt === undefined ? undefined : Number(todo.startsAt);
  const endsAt = todo.endsAt === undefined ? undefined : Number(todo.endsAt);
  const hasWindow = startsAt !== undefined && endsAt !== undefined;
  const metaRows =
    (dueAt !== undefined ? 1 : 0) +
    (remindAt !== undefined ? 1 : 0) +
    (hasWindow ? 1 : 0);

  const contentW = Math.max(10, panelWidth - PANEL_CHROME);
  const contentH = Math.max(0, panelHeight - PANEL_CHROME);
  const descBudget = Math.max(
    0,
    contentH - BASE_FIXED_ROWS - metaRows - DESC_HEADER,
  );
  const rawDesc = todo.description?.trim() ?? "";
  const preview =
    rawDesc && descBudget > 0
      ? renderMarkdown(rawDesc, contentW, descBudget)
      : null;
  const overflowed =
    Boolean(preview?.truncated) || (rawDesc.length > 0 && descBudget === 0);

  return (
    <Box flexDirection="column">
      {}
      <Box>
        <Text color={statusColor} bold>
          {statusIcon} {statusLabel}
        </Text>
        <Box flexGrow={1} />
        <Text color={color.muted} dimColor>
          {todo.id.slice(0, 8).toLowerCase()}…
        </Text>
      </Box>

      {}
      <Box marginTop={1}>
        <Text color={color.accent} bold wrap="truncate">
          {todo.title}
        </Text>
      </Box>

      {}
      <Box flexDirection="column" marginTop={1}>
        <InfoRow label="Project">
          {project ? (
            <Text>
              <Text color={swatchColor(project.color)}>● </Text>
              <Text>{project.name}</Text>
            </Text>
          ) : (
            <Text color={color.muted} dimColor>
              ● inbox
            </Text>
          )}
        </InfoRow>
        <InfoRow label="By">
          <Text color={color.accent2}>
            {ownerName ?? todo.createdBy.slice(0, 8).toLowerCase() + "…"}
          </Text>
        </InfoRow>
        <InfoRow label="Created">
          <Text>{relativeTime(nowMs, todo.createdAt)} ago</Text>
        </InfoRow>
        <InfoRow label="Updated">
          <Text>{relativeTime(nowMs, todo.updatedAt)} ago</Text>
        </InfoRow>
        {dueAt !== undefined && (
          <InfoRow label="Due">
            <Text
              color={
                isOverdue(dueAt, allDay, nowMs) ? color.danger : color.warn
              }
            >
              {dueLabel(dueAt, allDay, nowMs, todo.dueZone)}
              {allDay ? " (all-day)" : ""}
            </Text>
          </InfoRow>
        )}
        {remindAt !== undefined && (
          <InfoRow label="Remind">
            <Text color={color.accent2}>
              {dueLabel(remindAt, false, nowMs)}
            </Text>
          </InfoRow>
        )}
        {startsAt !== undefined && endsAt !== undefined && (
          <InfoRow label="Window">
            <Text color={color.accent2}>{windowLabel(startsAt, endsAt)}</Text>
          </InfoRow>
        )}
      </Box>

      {}
      {preview && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color.muted} dimColor>
            {"─ Description ".padEnd(Math.max(0, contentW), "─")}
          </Text>
          <Text color={color.muted}>{preview.text}</Text>
        </Box>
      )}

      {}
      <Box marginTop={1}>
        <Text color={color.muted} dimColor>
          press{" "}
          <Text color={color.accent} bold>
            ⏎
          </Text>{" "}
          {overflowed ? "to read the full description" : "for details"}
        </Text>
      </Box>
    </Box>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Box width={9}>
        <Text color={color.muted}>{label}</Text>
      </Box>
      {children}
    </Box>
  );
}

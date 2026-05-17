import { Box, Text } from "ink";

import type { Project, Todo } from "@dox/core";

import { color, icon } from "../../../theme";

interface TodoDetailsProps {
  todo: Todo | null;
  project: Project | null;
  // Fixed width — SurgeDM's File Details is built on the same constraint and
  // uses it for alignment. Pass the same value as the parent TitledPanel.
  width: number;
}

// Selected-todo inspector. Mirrors SurgeDM's File Details: status pill at top,
// label:value rows, then a progress bar, then a stats grid. We compute the
// "progress" as project completion if the todo belongs to one; otherwise it
// reflects per-todo done state (0% or 100%).
export function TodoDetails({ todo, project, width }: TodoDetailsProps) {
  if (!todo) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color={color.muted} dimColor>
          {"  "}select a todo to see details
        </Text>
      </Box>
    );
  }
  const status = todo.done ? "Done" : "Open";
  const statusColor = todo.done ? color.success : color.accent;
  // Inner width available for content (account for the 1-col x-padding either side).
  const inner = Math.max(20, width - 4);

  return (
    <Box flexDirection="column">
      <StatusPill label={status} color={statusColor} icon={todo.done ? icon.done : icon.open} />
      <Box marginTop={1} flexDirection="column">
        <Row label="ID" value={todo.id.slice(0, 12).toLowerCase() + "…"} />
        <Row label="Title" value={todo.title} />
        <Row label="Project" value={project ? project.name : "(inbox)"} />
        <Row label="Created" value={fmtTime(todo.createdAt)} />
        <Row label="Updated" value={fmtTime(todo.updatedAt)} />
      </Box>
      <Box marginTop={1}>
        <ProgressBar
          width={inner}
          ratio={todo.done ? 1 : 0}
          label="Progress"
        />
      </Box>
      <Box marginTop={1}>
        <StatsGrid
          rows={[
            ["Status", status, "Owner", todo.createdBy.slice(0, 8) + "…"],
            ["Project", project ? project.name : "—", "Color", project?.color || "—"],
          ]}
        />
      </Box>
    </Box>
  );
}

function StatusPill({ label, color: c, icon: ic }: { label: string; color: string; icon: string }) {
  return (
    <Box justifyContent="center">
      <Box borderStyle="round" borderColor={c} paddingX={2}>
        <Text color={c} bold>
          {ic} {label}
        </Text>
      </Box>
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={9}>
        <Text color={color.muted}>{label}:</Text>
      </Box>
      <Text wrap="truncate">{value}</Text>
    </Box>
  );
}

function ProgressBar({ width, ratio, label }: { width: number; ratio: number; label: string }) {
  // Reserve 12 cells for the label + " " + " 100%" suffix; the remainder is the
  // bar gutter itself.
  const suffix = `${Math.round(ratio * 100)}%`;
  const reserved = label.length + 2 + suffix.length + 2; // ": " around label, " " before %
  const barWidth = Math.max(4, width - reserved);
  const filled = Math.round(barWidth * ratio);
  return (
    <Box>
      <Text color={color.muted}>{label}: </Text>
      <Text color={color.accent}>{"█".repeat(filled)}</Text>
      <Text color={color.muted} dimColor>{"░".repeat(barWidth - filled)}</Text>
      <Text color={color.muted}>{` ${suffix}`}</Text>
    </Box>
  );
}

function StatsGrid({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <Box flexDirection="column">
      {rows.map((r, idx) => (
        <Box key={idx}>
          <Box width={9}>
            <Text color={color.muted}>{r[0]}:</Text>
          </Box>
          <Box width={14}>
            <Text wrap="truncate">{r[1]}</Text>
          </Box>
          <Box width={9}>
            <Text color={color.muted}>{r[2]}:</Text>
          </Box>
          <Text wrap="truncate">{r[3]}</Text>
        </Box>
      ))}
    </Box>
  );
}

function fmtTime(raw: unknown): string {
  const ms = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

import { Box, Text } from "ink";

import type { Project, Todo } from "@dox/core";

import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";

interface TodoInfoProps {
  todo: Todo | null;
  project: Project | null;
  ownerName?: string;
  nowMs: number;
  panelWidth: number;
  panelHeight: number;
}

const FIXED_ROWS = 10;
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

  const contentW = Math.max(10, panelWidth - PANEL_CHROME);
  const contentH = Math.max(0, panelHeight - PANEL_CHROME);
  const descBudget = Math.max(0, contentH - FIXED_ROWS - DESC_HEADER);
  const rawDesc = todo.description?.trim() ?? "";
  const preview =
    rawDesc && descBudget > 0
      ? previewDescription(rawDesc, contentW, descBudget)
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
      </Box>

      {}
      {preview && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={color.muted} dimColor>
            {"─ Description ".padEnd(Math.max(0, contentW), "─")}
          </Text>
          {preview.lines.map((line, idx) => (
            <Text key={idx} color={color.muted}>
              {line || " "}
            </Text>
          ))}
        </Box>
      )}

      {}
      <Box marginTop={1}>
        <Text color={color.muted} dimColor>
          press{" "}
          <Text color={color.accent} bold>
            ⏎
          </Text>{" "}
          {overflowed ? "to read full description" : "for details"}
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

interface WrappedPreview {
  lines: string[];
  truncated: boolean;
}
function previewDescription(
  text: string,
  width: number,
  maxLines: number,
): WrappedPreview {
  const lines: string[] = [];
  let overflowed = false;

  outer: for (const para of text.split(/\r?\n/)) {
    if (para === "") {
      lines.push("");
      if (lines.length >= maxLines) break;
      continue;
    }
    let buf = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = buf ? `${buf} ${word}` : word;
      if (next.length <= width) {
        buf = next;
        continue;
      }
      if (buf) {
        lines.push(buf);
        if (lines.length >= maxLines) {
          overflowed = true;
          break outer;
        }
      }
      let rest = word;
      while (rest.length > width) {
        lines.push(rest.slice(0, width));
        if (lines.length >= maxLines) {
          overflowed = true;
          break outer;
        }
        rest = rest.slice(width);
      }
      buf = rest;
    }
    if (buf) {
      lines.push(buf);
      if (lines.length >= maxLines) break;
    }
  }

  const consumedChars = lines.reduce((n, l) => n + l.length, 0);
  if (consumedChars < text.replace(/\s+/g, "").length) overflowed = true;

  if (overflowed && lines.length > 0) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] =
      last.length + 1 <= width
        ? `${last}…`
        : `${last.slice(0, Math.max(0, width - 1))}…`;
  }
  return { lines, truncated: overflowed };
}

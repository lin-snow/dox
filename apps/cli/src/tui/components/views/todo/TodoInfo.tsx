import { Box, Text } from "ink";

import type { Project, Todo } from "@dox/core";

import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";

interface TodoInfoProps {
  todo: Todo | null;
  project: Project | null;
  // Owner display name. ULID fallback is fine when no lookup is wired yet.
  ownerName?: string;
  nowMs: number;
  // Outer panel dimensions, used to compute how many description rows fit.
  panelWidth: number;
  panelHeight: number;
}

// Rows the non-description content always claims:
// status(1) + mtTitle(1) + title(1) + mtMeta(1) + meta(4) + mtFooter(1) + footer(1).
const FIXED_ROWS = 10;
// marginTop(1) + divider line(1) above the description text.
const DESC_HEADER = 2;
// TitledPanel chrome inside the content area: border(2) + paddingY(2).
const PANEL_CHROME = 4;

// Compact at-a-glance card for the cursored todo. Lives in the right-bottom
// panel; full Todo Detail page (Enter) carries the long-form view including
// any description that didn't fit in the preview below.
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
  const preview = rawDesc && descBudget > 0
    ? previewDescription(rawDesc, contentW, descBudget)
    : null;
  const overflowed = Boolean(preview?.truncated) || (rawDesc.length > 0 && descBudget === 0);

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

      {/* Description preview — fills whatever rows remain after the fixed
          sections. A "─ Description ─" divider mirrors the Recent strip in
          the Activity panel above so the right column reads as a coherent
          stack. Trailing "…" + footer hint cue the user to press Enter when
          the body overflows the budget. */}
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

      {/* Footer hint — kept inside the panel so users discover the detail
          page without reading the global footer. Wording shifts when the
          description was truncated above. */}
      <Box marginTop={1}>
        <Text color={color.muted} dimColor>
          press <Text color={color.accent} bold>⏎</Text>{" "}
          {overflowed ? "to read full description" : "for details"}
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

// Greedy word-wrap that honors user newlines and caps the output at `maxLines`.
// When the text doesn't fit, the last visible line gets a trailing ellipsis so
// the user has a visual cue that more content lives in the detail page. We
// re-implement wrapping (instead of relying on Ink's `wrap="wrap"`) because we
// need to know up-front whether truncation happened to switch the footer hint.
interface WrappedPreview {
  lines: string[];
  truncated: boolean;
}
function previewDescription(text: string, width: number, maxLines: number): WrappedPreview {
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
      // Hard-break words longer than the available width.
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

  // Anything we couldn't reach also counts as overflow.
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

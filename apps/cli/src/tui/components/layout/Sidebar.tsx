import { Box, Text } from "ink";
import type { Project } from "@dox/core";

import { color, icon } from "../../theme";

// "inbox" = private todos with no project (project_id IS NULL on the server).
// Surfaced to users as "Private" — see App.tsx tabs. Key stays "inbox" for
// persistence stability.
export type Filter = "inbox" | { type: "project"; id: string };

export function filterKey(f: Filter): string {
  if (f === "inbox") return f;
  return `p:${f.id}`;
}

export function filterLabel(f: Filter, projects: Project[]): string {
  if (f === "inbox") return "Private";
  const p = projects.find((p) => p.id === f.id);
  return p?.name ?? "Project";
}

interface SidebarProps {
  projects: Project[];
  current: Filter;
  focused: boolean;
  cursor: number;
  counts: { inbox: number; perProject: Record<string, number> };
}

interface Row {
  key: string;
  label: string;
  count: number;
  swatch?: string;
  divider?: boolean;
}

export function Sidebar({
  projects,
  current,
  focused,
  cursor,
  counts,
}: SidebarProps) {
  const rows: Row[] = [{ key: "inbox", label: "Private", count: counts.inbox }];
  if (projects.length > 0) {
    rows.push({ key: "__divider__", label: "", count: 0, divider: true });
    for (const p of projects) {
      rows.push({
        key: `p:${p.id}`,
        label: p.name,
        count: counts.perProject[p.id] ?? 0,
        swatch: p.color,
      });
    }
  }

  // Build the row-index → focus mapping skipping dividers, so the cursor index
  // (which counts only selectable filters) maps back to a render row.
  const selectableIndexes: number[] = [];
  rows.forEach((r, i) => {
    if (!r.divider) selectableIndexes.push(i);
  });
  const focusRowIdx = selectableIndexes[cursor] ?? -1;

  return (
    <Box flexDirection="column">
      {rows.map((row, idx) =>
        row.divider ? (
          <Box key={row.key}>
            <Text color={color.muted} wrap="truncate">
              {"─".repeat(60)}
            </Text>
          </Box>
        ) : (
          <SidebarRow
            key={row.key}
            row={row}
            selected={filterKey(current) === row.key}
            cursored={focused && idx === focusRowIdx}
          />
        ),
      )}
    </Box>
  );
}

function SidebarRow({
  row,
  selected,
  cursored,
}: {
  row: Row;
  selected: boolean;
  cursored: boolean;
}) {
  // Cursor draws the bar; the selected (committed) filter is bolded. When both
  // overlap the row uses accent for the bar so focus is obvious.
  const bar = cursored ? icon.selectBar : selected ? icon.selectBar : " ";
  const barColor = cursored
    ? color.accent
    : selected
      ? color.muted
      : color.muted;
  const labelColor = cursored
    ? color.accent
    : selected
      ? undefined
      : color.muted;
  return (
    <Box>
      <Text color={barColor}>{bar}</Text>
      <Text> </Text>
      {row.swatch ? (
        <Text color={swatchColor(row.swatch)}>● </Text>
      ) : (
        <Text> </Text>
      )}
      <Text color={labelColor} bold={selected}>
        {row.label}
      </Text>
      <Box flexGrow={1} />
      <Text color={color.muted}> {row.count}</Text>
    </Box>
  );
}

// Project colors come from the server as free-form strings. Map a few known
// names; fall back to muted so unknown values render harmlessly.
function swatchColor(raw: string): string {
  const known: Record<string, string> = {
    red: "red",
    green: "green",
    yellow: "yellow",
    blue: "blue",
    cyan: "cyan",
    magenta: "magenta",
    orange: "yellow",
    purple: "magenta",
    pink: "magentaBright",
  };
  return known[raw.toLowerCase()] ?? color.muted;
}

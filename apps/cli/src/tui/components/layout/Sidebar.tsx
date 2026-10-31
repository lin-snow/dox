import { Box, Text } from "ink";
import type { Project } from "@dox/core";

import { color, icon } from "../../theme";

export type Filter = "inbox" | "done" | { type: "project"; id: string };

export function filterKey(f: Filter): string {
  if (typeof f === "string") return f;
  return `p:${f.id}`;
}

export function filterLabel(f: Filter, projects: Project[]): string {
  if (f === "inbox") return "Private";
  if (f === "done") return "Done";
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

import { Box, Text } from "ink";

import type { Todo } from "@dox/core";

import { color } from "../../../theme";

interface ActivityLogProps {
  todos: Todo[];
  limit?: number;
}

// Compact "recent events" feed. Each row is `<icon>  <title>     <rel time>`
// with the icon colored by event type (created / edited / done). No absolute
// timestamp prefix — wall-clock time isn't actionable; recency is.
//
// Event type is inferred since dox has no events table:
//   - createdAt == updatedAt  → "added"  (+)
//   - done == true            → "done"   (✓)
//   - otherwise               → "edited" (~)
export function ActivityLog({ todos, limit = 6 }: ActivityLogProps) {
  if (todos.length === 0) {
    return (
      <Text color={color.muted} dimColor>
        no recent activity
      </Text>
    );
  }
  const now = Date.now();
  const sorted = [...todos]
    .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
    .slice(0, limit);
  return (
    <Box flexDirection="column">
      {sorted.map((t) => {
        const ev = inferEventType(t);
        return (
          <Box key={t.id}>
            <Text color={ev.color}>{` ${ev.glyph} `}</Text>
            <Text wrap="truncate">{t.title}</Text>
            <Box flexGrow={1} />
            <Text color={color.muted}>{relativeTime(now, t.updatedAt)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface Event {
  glyph: string;
  color: string;
}

function inferEventType(t: Todo): Event {
  if (t.done) return { glyph: "✓", color: color.success };
  if (t.createdAt === t.updatedAt) return { glyph: "+", color: color.accent };
  return { glyph: "~", color: color.accent2 };
}

function relativeTime(now: number, raw: unknown): string {
  const ms = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const diffMs = Math.max(0, now - ms);
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

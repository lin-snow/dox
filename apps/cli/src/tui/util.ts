import type { Todo } from "@dox/core";
import { formatWhenInput } from "@dox/core";

/**
 * Editor text for a todo's deadline: a bare date for all-day, date + time for
 * an instant, empty when there is none.
 */
export function dueInput(t: Todo): string {
  if (t.dueAt === undefined) return "";
  return formatWhenInput(Number(t.dueAt), t.dueAllDay ?? false, t.dueZone);
}

/**
 * One-line meeting window. A same-day window drops the repeated date so the
 * row still fits beside the other meta fields; anything spanning days keeps
 * both ends readable.
 */
export function windowLabel(startMs: number, endMs: number): string {
  const start = formatWhenInput(startMs, false);
  const end = formatWhenInput(endMs, false);
  return start.slice(0, 10) === end.slice(0, 10)
    ? `${start} → ${end.slice(11)}`
    : `${start} → ${end}`;
}

export function relativeTime(now: number, raw: unknown): string {
  const ms =
    typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
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

export function swatchColor(raw: string | undefined): string {
  if (!raw) return "gray";
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
  return known[raw.toLowerCase()] ?? "gray";
}

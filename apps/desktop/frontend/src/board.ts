import type { Todo } from "./api";
import { byUrgency, endOfToday, ms } from "./format";

/** The board is grouped by deadline, not by state, so a task never jumps
 * columns while you are looking at it: marking it done keeps it in place. */
export type Bucket = "later" | "week" | "today";

export const BUCKETS: readonly { key: Bucket; label: string }[] = [
  { key: "later", label: "Later" },
  { key: "week", label: "This week" },
  { key: "today", label: "Today" },
];

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function bucketOf(todo: Todo, now = Date.now()): Bucket {
  const at = ms(todo.dueAt);
  if (!at) return "later";
  const horizon = endOfToday(now);
  if (at <= horizon) return "today";
  if (at <= horizon + WEEK) return "week";
  return "later";
}

export function group(todos: Todo[], now = Date.now()): Record<Bucket, Todo[]> {
  const out: Record<Bucket, Todo[]> = { later: [], week: [], today: [] };
  for (const todo of [...todos].sort(byUrgency)) {
    out[bucketOf(todo, now)].push(todo);
  }
  return out;
}

/** Board order, top to bottom, left to right — the order the arrow keys walk. */
export function flatten(columns: Record<Bucket, Todo[]>): Todo[] {
  return BUCKETS.flatMap((bucket) => columns[bucket.key]);
}

export interface ChecklistItem {
  done: boolean;
  text: string;
}

const TASK_LINE = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;

/**
 * Subtasks live in the markdown description as GFM task lines — the server
 * already stores markdown, so a checklist needs no schema change. A note is
 * read as a checklist only when every non-empty line is a task line;
 * anything else is prose and is shown as one.
 */
export function readChecklist(note?: string): ChecklistItem[] | null {
  if (!note) return null;
  const lines = note.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return null;
  const items: ChecklistItem[] = [];
  for (const line of lines) {
    const hit = TASK_LINE.exec(line);
    if (!hit) return null;
    items.push({
      done: hit[1] === "x" || hit[1] === "X",
      text: (hit[2] ?? "").trim(),
    });
  }
  return items;
}

export function writeChecklist(items: ChecklistItem[]): string {
  return items
    .filter((item) => item.text.trim() !== "")
    .map((item) => `- [${item.done ? "x" : " "}] ${item.text.trim()}`)
    .join("\n");
}

/** First line of prose, stripped of the markers that would read as noise. */
export function proseOf(note?: string): string {
  if (!note) return "";
  const first = note
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !TASK_LINE.test(line));
  return (first ?? "").replace(/^[#>\s-]+/, "").slice(0, 180);
}

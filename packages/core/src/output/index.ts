import type { IO } from "../io";
import type { ReminderList } from "../notifications/domain";
import { dueLabel, elapsedLabel, formatWhenInput } from "../time";
import type { Todo } from "../todo/domain";

export interface Output {
  todo(t: Todo): void;
  todos(ts: Todo[]): void;
  reminders(list: ReminderList): void;
  ok(message: string, details?: Record<string, unknown>): void;
  error(message: string): void;
}

export class HumanOutput implements Output {
  constructor(private readonly io: IO) {}

  todo(t: Todo): void {
    this.io.stdout.write(formatTodo(t) + "\n");
  }

  todos(ts: Todo[]): void {
    if (ts.length === 0) {
      this.io.stdout.write("(no todos)\n");
      return;
    }
    this.io.stdout.write(ts.map(formatTodo).join("\n") + "\n");
  }

  reminders(list: ReminderList): void {
    if (list.notifications.length === 0) {
      this.io.stdout.write("(no reminders)\n");
      return;
    }
    for (const r of list.notifications) {
      const unread = r.readAt === undefined ? "• " : "  ";
      const when = elapsedLabel(Number(r.scheduledFor), Date.now());
      const label = when === "now" ? "now" : `${when} ago`;
      this.io.stdout.write(`${unread}${label.padStart(7)}  ${r.todoTitle}\n`);
    }
    this.io.stdout.write(
      `${list.unreadCount} unread of ${list.notifications.length}\n`,
    );
  }

  ok(message: string): void {
    this.io.stdout.write(message + "\n");
  }

  error(message: string): void {
    this.io.stderr.write(`dox: ${message}\n`);
  }
}

export class JsonOutput implements Output {
  constructor(private readonly io: IO) {}

  todo(t: Todo): void {
    this.io.stdout.write(JSON.stringify(t) + "\n");
  }

  todos(ts: Todo[]): void {
    this.io.stdout.write(JSON.stringify({ todos: ts }) + "\n");
  }

  reminders(list: ReminderList): void {
    this.io.stdout.write(JSON.stringify(list) + "\n");
  }

  ok(message: string, details?: Record<string, unknown>): void {
    this.io.stdout.write(
      JSON.stringify({ ok: true, message, ...(details ?? {}) }) + "\n",
    );
  }

  error(message: string): void {
    this.io.stderr.write(JSON.stringify({ error: message }) + "\n");
  }
}

function formatTodo(t: Todo): string {
  const mark = t.done ? "[x]" : "[ ]";
  const id = t.id.slice(0, 6);
  return `${mark} ${id}…  ${t.title}${formatMeeting(t)}${formatDeadline(t)}`;
}

/**
 * Window badge for a meeting: the start carries the date, the end only the
 * clock, so a row stays short. Local time throughout — a meeting is an
 * instant, unlike an all-day deadline which is pinned to a zone.
 */
function formatMeeting(t: Todo): string {
  if (t.startsAt === undefined || t.endsAt === undefined) return "";
  const start = Number(t.startsAt);
  const end = new Date(Number(t.endsAt));
  const clock = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  return `  🗓 ${formatWhenInput(start, false)}–${clock}`;
}

/**
 * Trailing badge: `  ⌛-2h` / `  ⌛3h` for a deadline, `  ⏰1h` when only a
 * reminder is set. Negative spans already read as overdue.
 */
function formatDeadline(t: Todo): string {
  const now = Date.now();
  if (t.dueAt !== undefined) {
    return `  ⌛${dueLabel(Number(t.dueAt), t.dueAllDay ?? false, now, t.dueZone)}`;
  }
  if (t.remindAt !== undefined) {
    return `  ⏰${dueLabel(Number(t.remindAt), false, now)}`;
  }
  return "";
}

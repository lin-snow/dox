import type { Todo } from "./domain";

/**
 * iCalendar export for meetings.
 *
 * Meetings are todos with a window, so this is the only way to get them onto a
 * real calendar without the server growing an account-backed CalDAV surface:
 * the file is generated from what the thin client already has.
 *
 * Scope: VEVENTs for todos that carry a window and are still open. Done todos
 * and plain tasks are skipped — a calendar full of finished history is noise,
 * and a todo without a window has nothing to place on a timeline.
 */

export interface ICSOptions {
  /** Injectable for tests; defaults to the moment of export. */
  now?: number;
  /** Display name for the calendar; defaults to "dox". */
  calendarName?: string;
}

const CRLF = "\r\n";

export function todosToICS(todos: Todo[], opts: ICSOptions = {}): string {
  const stamp = utcStamp(opts.now ?? Date.now());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dox//todo calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "dox")}`,
  ];

  for (const todo of todos) {
    if (todo.done) continue;
    if (todo.startsAt === undefined || todo.endsAt === undefined) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${todo.id}@dox`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(Number(todo.startsAt))}`,
      `DTEND:${utcStamp(Number(todo.endsAt))}`,
      `SUMMARY:${escapeText(todo.title)}`,
    );
    if (todo.description) {
      lines.push(`DESCRIPTION:${escapeText(todo.description)}`);
    }
    lines.push("STATUS:CONFIRMED", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}

/** RFC 5545 wants UTC basic-format stamps: 20261105T093000Z. */
function utcStamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Backslash, semicolon, comma and newline are the TEXT metacharacters. */
function escapeText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold at 75 octets (not characters — a CJK title overflows a naive slice),
 * continuing on a line that starts with a single space.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let bytes = 0;
  // Continuation lines spend one octet on the leading space.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      // RFC 5545: the continuation line's leading space is inside the fold
      // marker itself, so the appended space below consumes one octet.
      current = " " + char;
      bytes = 1 + size;
      limit = 75;
      continue;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join(CRLF);
}

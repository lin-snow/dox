/**
 * Shared due-date vocabulary for the CLI and TUI.
 *
 * One parser and one formatter, so "2026-11-05", "2026-11-05 09:30", "09:30"
 * and "+45m" can never mean different things in two places. Instants are UTC
 * milliseconds on the wire; everything user-facing below is local time, except
 * all-day deadlines which are pinned to an IANA zone so a team spread across
 * zones sees the same calendar day.
 */

export interface ParsedWhen {
  /** UTC milliseconds. */
  at: number;
  /** True for a bare date: a calendar day, not an instant. */
  allDay: boolean;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const RELATIVE_RE = /^\+\s*(\d+)\s*(m|h|d|w)$/i;

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * Parses user input into an instant. Returns null for anything ambiguous or
 * impossible (2026-02-31, 25:00) so callers can show a validation error instead
 * of silently scheduling the wrong moment.
 *
 * - `YYYY-MM-DD` -> all-day deadline at local midnight
 * - `YYYY-MM-DD HH:MM` -> exact local instant
 * - `HH:MM` -> today at that time, or tomorrow when it already passed
 * - `+15m`, `+2h`, `+3d` -> relative to `now` (the useful one for reminders)
 */
export function parseWhen(raw: string, now = Date.now()): ParsedWhen | null {
  const input = raw.trim();
  if (!input) return null;

  const rel = RELATIVE_RE.exec(input);
  if (rel) {
    const amount = Number(rel[1]);
    const unit = UNIT_MS[(rel[2] ?? "").toLowerCase()];
    if (!unit || amount <= 0) return null;
    return { at: now + amount * unit, allDay: false };
  }

  const date = DATE_RE.exec(input);
  if (date) {
    const at = buildLocal(
      Number(date[1]),
      Number(date[2]),
      Number(date[3]),
      0,
      0,
    );
    return at === null ? null : { at, allDay: true };
  }

  const stamp = DATETIME_RE.exec(input);
  if (stamp) {
    const at = buildLocal(
      Number(stamp[1]),
      Number(stamp[2]),
      Number(stamp[3]),
      Number(stamp[4]),
      Number(stamp[5]),
    );
    return at === null ? null : { at, allDay: false };
  }

  const time = TIME_RE.exec(input);
  if (time) {
    const hours = Number(time[1]);
    const minutes = Number(time[2]);
    if (hours > 23 || minutes > 59) return null;
    const at = new Date(now);
    at.setHours(hours, minutes, 0, 0);
    // "09:30" typed in the evening is tomorrow's 09:30, not a past instant
    // the reminder sweep would drop as stale.
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return { at: at.getTime(), allDay: false };
  }

  return null;
}

/** Inverse of the date-only / date-time parse, for prefilling an editor. */
export function formatWhenInput(
  at: number,
  allDay: boolean,
  zone?: string,
): string {
  const p = zoneParts(at, allDay ? (zone ?? localZone()) : localZone());
  const date = `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
  return allDay ? date : `${date} ${pad(p.hour, 2)}:${pad(p.minute, 2)}`;
}

/**
 * Compact badge for list rows: "3h" upcoming, "-2h" overdue, "today"/"tmrw"
 * for calendar-day deadlines.
 */
export function dueLabel(
  at: number,
  allDay: boolean,
  now: number,
  zone?: string,
): string {
  if (allDay) {
    const z = zone ?? localZone();
    const start = startOfDay(at, z);
    const diff = Math.round((start - startOfDay(now, z)) / 86_400_000);
    if (diff === 0) return "today";
    if (diff === 1) return "tmrw";
    if (diff === -1) return "yday";
    const p = zoneParts(at, z);
    return `${MONTHS[p.month - 1] ?? "?"} ${p.day}`;
  }
  const delta = at - now;
  return delta < 0 ? `-${compactSpan(-delta)}` : compactSpan(delta);
}

/** Compact "how long ago" for reminder rows: "now", "5m", "3h", "2d". */
export function elapsedLabel(at: number, now: number): string {
  const delta = now - at;
  return delta < 60_000 ? "now" : compactSpan(delta);
}

export function isOverdue(at: number, allDay: boolean, now: number): boolean {
  if (!allDay) return at < now;
  const zone = localZone();
  // An all-day deadline is overdue only once its calendar day has passed.
  return startOfDay(at, zone) < startOfDay(now, zone);
}

function compactSpan(ms: number): string {
  if (ms < 60_000) return "<1m";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Local wall-clock time constructor that rejects overflowing fields. */
function buildLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Date() silently rolls 2026-02-31 into March; reject instead.
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d.getTime();
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zoneParts(at: number, zone: string): ZoneParts {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)) {
    parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year ?? "1970"),
    month: Number(parts.month ?? "1"),
    day: Number(parts.day ?? "1"),
    hour: Number(parts.hour ?? "0") % 24,
    minute: Number(parts.minute ?? "0"),
  };
}

/** UTC midnight of the calendar day that `ms` falls on in `zone`, for day math. */
function startOfDay(ms: number, zone: string): number {
  const p = zoneParts(ms, zone);
  return Date.UTC(p.year, p.month - 1, p.day);
}

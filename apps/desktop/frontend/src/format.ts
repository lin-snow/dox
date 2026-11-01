import { elapsedLabel, localZone } from "@dox/core/browser";

import type { Todo } from "./api";

/** grpc-gateway renders int64 as a JSON string; "" and undefined mean unset. */
export function ms(value?: string | number | null): number {
  return value === undefined || value === null || value === ""
    ? 0
    : Number(value);
}

/** Calendar day of an instant, rendered in the todo's own zone when set. */
export function dayInput(at: number, zone?: string): string {
  if (!at) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

/** `YYYY-MM-DDTHH:MM` for a local datetime-local input. */
export function dateTimeInput(at: number): string {
  if (!at) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function clockInput(at: number): string {
  const value = dateTimeInput(at);
  return value ? value.slice(11, 16) : "";
}

export function longDate(at: number, allDay: boolean, zone?: string): string {
  if (!at) return "";
  const options: Intl.DateTimeFormatOptions = allDay
    ? {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: zone || undefined,
      }
    : {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
  return new Intl.DateTimeFormat(undefined, options).format(new Date(at));
}

export function relative(iso?: string): string {
  const at = ms(iso);
  return at ? elapsedLabel(at, Date.now()) : "";
}

/** "just now" / "5m ago" — elapsedLabel already compacts anything under a minute. */
export function sinceLabel(iso?: string): string {
  const span = relative(iso);
  if (!span) return "";
  return span === "now" ? "just now" : `${span} ago`;
}

export interface DueFields {
  dueAt?: number | null;
  dueAllDay?: boolean;
  dueZone?: string;
}

/**
 * Translate the detail pane's two inputs into a patch. A date without a clock
 * is a calendar day pinned to the caller's zone, matching parseWhen() in
 * packages/core; a date with a clock is an exact instant, which clears the
 * zone. Clearing the date clears the deadline.
 */
export function dueFields(date: string, time: string): DueFields {
  if (!date) return { dueAt: null, dueAllDay: false, dueZone: "" };
  if (time) {
    return {
      dueAt: new Date(`${date}T${time}`).getTime(),
      dueAllDay: false,
      dueZone: "",
    };
  }
  return {
    dueAt: new Date(`${date}T00:00:00`).getTime(),
    dueAllDay: true,
    dueZone: localZone(),
  };
}

/** Chip label: "Nov 5" for a calendar day, "Nov 5 7:30 PM" for an instant. */
export function chipDate(at: number, allDay: boolean, zone?: string): string {
  if (!at) return "";
  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: zone || undefined,
  }).format(new Date(at));
  if (allDay) return day;
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
  return `${day} ${time}`;
}

/** Past its deadline — an all-day todo is late only once the day is over. */
export function isOverdue(todo: Todo, now = Date.now()): boolean {
  const at = ms(todo.dueAt);
  return at > 0 && !todo.done && at < startOfToday(now);
}

export function isDueToday(todo: Todo, now = Date.now()): boolean {
  const at = ms(todo.dueAt);
  if (!at || todo.done) return false;
  return at <= endOfToday(now);
}

export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Open before done, then by deadline (undated last), then newest first. Same
 * order the TUI uses, so the two clients never disagree about "next up".
 */
export function byUrgency(a: Todo, b: Todo): number {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  const da = ms(a.dueAt) || Infinity;
  const db = ms(b.dueAt) || Infinity;
  if (da !== db) {
    if (da === Infinity) return 1;
    if (db === Infinity) return -1;
    return da - db;
  }
  return ms(b.createdAt) - ms(a.createdAt);
}

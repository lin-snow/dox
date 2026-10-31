import { describe, expect, test } from "bun:test";

import { dueLabel, parseWhen } from "./index";

const now = new Date(2026, 10, 1, 12, 0, 0, 0).getTime(); // 2026-11-01 12:00 local

describe("parseWhen", () => {
  test("bare date is an all-day deadline at local midnight", () => {
    const got = parseWhen("2026-11-05", now);
    expect(got).toEqual({
      at: new Date(2026, 10, 5, 0, 0, 0, 0).getTime(),
      allDay: true,
    });
  });

  test("date + time is an exact instant", () => {
    expect(parseWhen("2026-11-05 09:30", now)).toEqual({
      at: new Date(2026, 10, 5, 9, 30, 0, 0).getTime(),
      allDay: false,
    });
    expect(parseWhen("2026-11-05T09:30", now)?.allDay).toBe(false);
  });

  test("bare time rolls to tomorrow once it has passed", () => {
    expect(parseWhen("09:30", now)?.at).toBe(
      new Date(2026, 10, 2, 9, 30, 0, 0).getTime(),
    );
    expect(parseWhen("18:00", now)?.at).toBe(
      new Date(2026, 10, 1, 18, 0, 0, 0).getTime(),
    );
  });

  test("relative offsets", () => {
    expect(parseWhen("+15m", now)?.at).toBe(now + 15 * 60_000);
    expect(parseWhen("+2h", now)?.at).toBe(now + 2 * 3_600_000);
    expect(parseWhen("+0m", now)).toBeNull();
  });

  test("rejects impossible input instead of rolling it over", () => {
    expect(parseWhen("2026-02-31", now)).toBeNull();
    expect(parseWhen("2026-13-01", now)).toBeNull();
    expect(parseWhen("25:00", now)).toBeNull();
    expect(parseWhen("tomorrow", now)).toBeNull();
    expect(parseWhen("", now)).toBeNull();
  });
});

describe("dueLabel", () => {
  test("calendar-day labels", () => {
    const today = new Date(2026, 10, 1, 0, 0, 0, 0).getTime();
    const tomorrow = new Date(2026, 10, 2, 0, 0, 0, 0).getTime();
    const later = new Date(2026, 10, 9, 0, 0, 0, 0).getTime();
    expect(dueLabel(today, true, now)).toBe("today");
    expect(dueLabel(tomorrow, true, now)).toBe("tmrw");
    expect(dueLabel(later, true, now)).toBe("Nov 9");
  });

  test("exact instants are compact spans, overdue prefixed", () => {
    expect(dueLabel(now + 90 * 60_000, false, now)).toBe("1h");
    expect(dueLabel(now - 2 * 3_600_000, false, now)).toBe("-2h");
    expect(dueLabel(now + 30_000, false, now)).toBe("<1m");
  });
});

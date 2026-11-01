import { describe, expect, test } from "bun:test";

import type { Todo } from "./domain";
import { todosToICS } from "./ics";

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    title: "design review",
    done: false,
    createdBy: "u1",
    createdAt: "0",
    updatedAt: "0",
    startsAt: String(Date.UTC(2026, 10, 5, 9, 0, 0)),
    endsAt: String(Date.UTC(2026, 10, 5, 10, 0, 0)),
    ...overrides,
  };
}

const lines = (ics: string) => ics.split("\r\n");

describe("todosToICS", () => {
  test("emits a UTC VEVENT for a window", () => {
    const ics = todosToICS([todo()], { now: Date.UTC(2026, 10, 1, 0, 0, 0) });
    expect(lines(ics)).toContain("BEGIN:VEVENT");
    expect(lines(ics)).toContain("DTSTART:20261105T090000Z");
    expect(lines(ics)).toContain("DTEND:20261105T100000Z");
    expect(lines(ics)).toContain("DTSTAMP:20261101T000000Z");
    expect(lines(ics)).toContain("SUMMARY:design review");
    // RFC 5545 wants CRLF everywhere, including the terminator.
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  test("skips done todos and todos without a window", () => {
    const ics = todosToICS(
      [
        todo({ id: "a", done: true }),
        todo({ id: "b", startsAt: undefined, endsAt: undefined }),
        todo({ id: "c" }),
      ],
      { now: 0 },
    );
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    expect(ics).toContain("UID:c@dox");
  });

  test("escapes TEXT metacharacters", () => {
    const ics = todosToICS(
      [todo({ title: "a; b, c\\d", description: "line 1\nline 2" })],
      { now: 0 },
    );
    expect(lines(ics)).toContain("SUMMARY:a\\; b\\, c\\\\d");
    expect(lines(ics)).toContain("DESCRIPTION:line 1\\nline 2");
  });

  test("folds long lines at 75 octets, multibyte safe", () => {
    const title = "会議".repeat(40); // 240 bytes of CJK
    const ics = todosToICS([todo({ title })], { now: 0 });
    const summary = lines(ics).filter(
      (line, at, all) =>
        line.startsWith("SUMMARY:") ||
        (all[at - 1]?.startsWith("SUMMARY:") && line.startsWith(" ")),
    );
    expect(summary.length).toBeGreaterThan(1);
    for (const line of lines(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolding (drop the CRLF + leading space) restores the original text.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
  });
});

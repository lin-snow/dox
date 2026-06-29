import { describe, expect, test } from "bun:test";

import { relativeTime, swatchColor } from "./util";

describe("relativeTime", () => {
  const now = 1_000_000_000_000;

  test("buckets across seconds/minutes/hours/days/weeks", () => {
    const cases: Array<[number, string]> = [
      [0, "0s"],
      [30_000, "30s"],
      [90_000, "1m"],
      [60 * 60_000, "1h"],
      [3 * 60 * 60_000, "3h"],
      [25 * 60 * 60_000, "1d"],
      [3 * 24 * 60 * 60_000, "3d"],
      [8 * 24 * 60 * 60_000, "1w"],
      [21 * 24 * 60 * 60_000, "3w"],
    ];
    for (const [agoMs, want] of cases) {
      expect(relativeTime(now, now - agoMs)).toBe(want);
    }
  });

  test("accepts grpc-gateway string-encoded int64", () => {
    expect(relativeTime(now, String(now - 90_000))).toBe("1m");
  });

  test("future timestamps clamp to 0s rather than going negative", () => {
    expect(relativeTime(now, now + 60_000)).toBe("0s");
  });

  test("non-finite / non-positive / wrong-type inputs render an em dash", () => {
    expect(relativeTime(now, 0)).toBe("—");
    expect(relativeTime(now, -1)).toBe("—");
    expect(relativeTime(now, "not-a-number")).toBe("—");
    expect(relativeTime(now, undefined)).toBe("—");
    expect(relativeTime(now, null)).toBe("—");
  });
});

describe("swatchColor", () => {
  test("maps the canonical ink color names through unchanged", () => {
    for (const c of ["red", "green", "yellow", "blue", "cyan", "magenta"]) {
      expect(swatchColor(c)).toBe(c);
    }
  });

  test("maps friendly aliases to the nearest ink color", () => {
    expect(swatchColor("orange")).toBe("yellow");
    expect(swatchColor("purple")).toBe("magenta");
    expect(swatchColor("pink")).toBe("magentaBright");
  });

  test("is case-insensitive", () => {
    expect(swatchColor("RED")).toBe("red");
    expect(swatchColor("Purple")).toBe("magenta");
  });

  test("falls back to gray for unknown or missing colors", () => {
    expect(swatchColor("chartreuse")).toBe("gray");
    expect(swatchColor("")).toBe("gray");
    expect(swatchColor(undefined)).toBe("gray");
  });
});

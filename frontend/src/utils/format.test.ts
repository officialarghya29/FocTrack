import { describe, expect, it } from "vitest";
import {
  endOfDayIso,
  formatClock,
  formatDuration,
  formatHours,
  percent,
  startOfDayIso,
} from "./format";

describe("formatClock", () => {
  it("formats under an hour as mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("adds hours when needed", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(7325)).toBe("2:02:05");
  });

  it("never shows negative time", () => {
    expect(formatClock(-30)).toBe("00:00");
  });
});

describe("formatDuration", () => {
  it("uses compact units", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3900)).toBe("1h 05m");
  });
});

describe("formatHours", () => {
  it("renders chart-friendly hours", () => {
    expect(formatHours(0)).toBe("0h");
    expect(formatHours(900)).toBe("15m");
    expect(formatHours(5400)).toBe("1.5h");
    expect(formatHours(36000)).toBe("10h");
  });
});

describe("percent", () => {
  it("rounds to the requested digits", () => {
    expect(percent(0.8567)).toBe("86%");
    expect(percent(0.8567, 1)).toBe("85.7%");
  });
});

describe("day boundaries", () => {
  it("returns an ISO instant covering the whole local day", () => {
    const start = new Date(startOfDayIso("2026-11-26"));
    const end = new Date(endOfDayIso("2026-11-26"));
    expect(start.getDate()).toBe(26);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

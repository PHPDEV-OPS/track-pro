import { describe, expect, it } from "vitest";
import { elapsedSec, formatClock, remainingSec } from "./timer";

const t0 = new Date("2026-01-01T10:00:00Z").getTime();

describe("elapsedSec", () => {
  it("counts running time from lastResumedAt", () => {
    const s = { status: "RUNNING" as const, accumulatedSec: 120, lastResumedAt: new Date(t0) };
    expect(elapsedSec(s, t0 + 30_000)).toBe(150);
  });
  it("freezes while paused", () => {
    const s = { status: "PAUSED" as const, accumulatedSec: 120, lastResumedAt: null };
    expect(elapsedSec(s, t0 + 999_000)).toBe(120);
  });
  it("never goes negative on clock skew", () => {
    const s = { status: "RUNNING" as const, accumulatedSec: 5, lastResumedAt: new Date(t0 + 10_000) };
    expect(elapsedSec(s, t0)).toBe(5);
  });
});

describe("remaining and format", () => {
  it("goes negative in overtime and formats with +", () => {
    const s = { status: "RUNNING" as const, accumulatedSec: 0, lastResumedAt: new Date(t0), targetSec: 60 };
    expect(remainingSec(s, t0 + 90_000)).toBe(-30);
    expect(formatClock(-30)).toBe("+00:30");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

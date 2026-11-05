import { describe, expect, it } from "vitest";
import { elapsedSec, formatClock, formatLed, LED_SEGMENTS, remainingSec } from "./timer";

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

describe("LED clock", () => {
  it("always shows HH:MM:SS, with a + in overtime", () => {
    expect(formatLed(1500)).toBe("00:25:00");
    expect(formatLed(10033)).toBe("02:47:13");
    expect(formatLed(-192)).toBe("+00:03:12");
    expect(formatLed(0)).toBe("00:00:00");
  });
  it("lights the right segments for each digit", () => {
    expect(Object.keys(LED_SEGMENTS)).toHaveLength(10);
    expect(LED_SEGMENTS["8"]).toBe("abcdefg");
    expect(LED_SEGMENTS["1"]).toBe("bc");
    // Every digit uses only the seven known segments.
    for (const segs of Object.values(LED_SEGMENTS)) expect(segs).toMatch(/^[a-g]+$/);
  });
});

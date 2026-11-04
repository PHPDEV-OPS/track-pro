import { describe, expect, it } from "vitest";
import { buildDays, levelFor, toWeeks, tooltipText } from "./heatmap";

describe("heatmap", () => {
  it("maps minutes to levels at the boundaries", () => {
    expect([0, 1, 59, 60, 119, 120, 239, 240].map(levelFor)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it("builds 365 days ending today", () => {
    const cells = buildDays("2026-10-24", { "2026-10-24": 4 * 3600 });
    expect(cells).toHaveLength(365);
    expect(cells.at(-1)).toMatchObject({ date: "2026-10-24", minutes: 240, level: 4 });
    expect(tooltipText(cells.at(-1)!)).toBe("4h focused on Oct 24");
  });
  it("pads weeks so rows start on Monday and hold at most 7 cells", () => {
    const weeks = toWeeks(buildDays("2026-10-24", {}));
    expect(weeks.every((w) => w.length <= 7)).toBe(true);
    // 2025-10-25 is a Saturday, so it sits in row 6 (Mon is row 1).
    expect(weeks[0].findIndex(Boolean)).toBe(5);
  });
});

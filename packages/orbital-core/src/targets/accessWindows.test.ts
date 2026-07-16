import { describe, expect, it } from "vitest";
import { summarizeAccessWindows, type AccessWindow } from "./accessWindows";

const window = (startSeconds: number, endSeconds: number): AccessWindow => ({
  startSeconds, endSeconds, clippedAtStart: false, clippedAtEnd: false,
});

describe("access-window statistics", () => {
  it("computes duration, coverage, revisit intervals and boundary-aware maximum gap", () => {
    const result = summarizeAccessWindows([window(10, 20), window(40, 50), window(70, 100)], 0, 120);
    expect(result.accessCount).toBe(3);
    expect(result.totalAccessDurationSeconds).toBe(50);
    expect(result.coverageFraction).toBeCloseTo(5 / 12);
    expect(result.meanAccessDurationSeconds).toBeCloseTo(50 / 3);
    expect(result.maxAccessDurationSeconds).toBe(30);
    expect(result.revisitIntervalsSeconds).toEqual([20, 20]);
    expect(result.meanRevisitSeconds).toBe(20);
    expect(result.maxUncoveredGapSeconds).toBe(20);
  });

  it("reports the entire analysis range as uncovered when no access exists", () => {
    const result = summarizeAccessWindows([], 100, 460);
    expect(result.accessCount).toBe(0);
    expect(result.coverageFraction).toBe(0);
    expect(result.maxUncoveredGapSeconds).toBe(360);
    expect(result.meanRevisitSeconds).toBeUndefined();
  });

  it("rejects overlapping or out-of-range windows", () => {
    expect(() => summarizeAccessWindows([window(10, 20), window(19, 30)], 0, 40)).toThrow(/不能重叠/);
    expect(() => summarizeAccessWindows([window(-1, 2)], 0, 40)).toThrow(/超出/);
  });
});

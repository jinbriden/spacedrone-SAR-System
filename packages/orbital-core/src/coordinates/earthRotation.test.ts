import { describe, expect, it } from "vitest";
import { eciToEcef } from "./earthRotation";

describe("ECI to ECEF", () => {
  it("地球自转后同一惯性位置的地固经度发生变化", () => {
    const positionEciM = [7_000_000, 0, 0] as const;
    const first = eciToEcef(positionEciM, new Date("2026-07-15T00:00:00Z"));
    const second = eciToEcef(positionEciM, new Date("2026-07-15T01:00:00Z"));
    expect(Math.hypot(second[0] - first[0], second[1] - first[1])).toBeGreaterThan(
      1_000_000,
    );
    expect(Math.hypot(...first)).toBeCloseTo(Math.hypot(...second), 6);
  });
});

import { describe, expect, it } from "vitest";
import { summarizeAccessWindows } from "@spacedrone/orbital-core";
import { revisitAnalysisToCsv } from "./revisitExport";

describe("revisit CSV export", () => {
  it("exports visibility and coverage windows with summary fields and escaping", () => {
    const windows = [{ startSeconds: 10, endSeconds: 20, clippedAtStart: false, clippedAtEnd: false }];
    const statistics = summarizeAccessWindows(windows, 0, 100);
    const csv = revisitAnalysisToCsv({
      startSeconds: 0, endSeconds: 100, startUtc: "2026-01-01T00:00:00.000Z", endUtc: "2026-01-01T00:01:40.000Z",
      sampleStepSeconds: 10, transitionToleranceSeconds: 0.5, coarseSampleCount: 11,
      satelliteCount: 1,
      targets: [{ targetId: "a", targetName: "目标,一", visibilityWindows: windows, visibilityStatistics: statistics, coverageWindows: windows, coverageStatistics: statistics }],
      satellites: [{ satelliteId: "primary", satelliteName: "SAT-1", targets: [{ targetId: "a", targetName: "目标,一", visibilityWindows: windows, visibilityStatistics: statistics, coverageWindows: windows, coverageStatistics: statistics }] }],
    });
    expect(csv).toContain('constellation,星座联合,a,"目标,一",visibility,1,10,20,2026-01-01T00:00:10.000Z,2026-01-01T00:00:20.000Z,10');
    expect(csv).toContain('primary,SAT-1,a,"目标,一",coverage,1,10,20,2026-01-01T00:00:10.000Z,2026-01-01T00:00:20.000Z,10');
  });
});

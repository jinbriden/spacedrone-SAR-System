import { describe, expect, it } from "vitest";
import { taskPlanToCsv } from "./taskPlanExport";

describe("task-plan CSV export", () => {
  it("exports task summaries, scheduled segments and opportunities with UTC", () => {
    const csv = taskPlanToCsv({
      startSeconds: 0, endSeconds: 100, startUtc: "2026-01-01T00:00:00.000Z", endUtc: "2026-01-01T00:01:40.000Z",
      sampleStepSeconds: 5, transitionToleranceSeconds: 0.1, coarseSampleCount: 21, satelliteCount: 1,
      satelliteNames: { primary: "SAT-1" }, targetNames: { t: "区域,一" },
      opportunities: [{ taskId: "t", targetId: "t", targetName: "区域,一", satelliteId: "primary", satelliteName: "SAT-1", startSeconds: 10, endSeconds: 30, clippedAtStart: false, clippedAtEnd: false }],
      schedule: {
        tasks: [{ taskId: "t", targetId: "t", priority: 8, requiredDurationSeconds: 10, scheduledDurationSeconds: 10, remainingDurationSeconds: 0, status: "completed", segments: [{ taskId: "t", targetId: "t", satelliteId: "primary", startSeconds: 10, endSeconds: 20, durationSeconds: 10, priority: 8 }] }],
        segments: [{ taskId: "t", targetId: "t", satelliteId: "primary", startSeconds: 10, endSeconds: 20, durationSeconds: 10, priority: 8 }],
        satelliteUtilization: { primary: 0.1 },
      },
    });
    expect(csv).toContain('task-summary,,,t,"区域,一",8,completed');
    expect(csv).toContain('scheduled-segment,primary,SAT-1,t,"区域,一",8,scheduled,10,20,2026-01-01T00:00:10.000Z');
    expect(csv).toContain('opportunity,primary,SAT-1,t,"区域,一",,available,10,30');
  });
});

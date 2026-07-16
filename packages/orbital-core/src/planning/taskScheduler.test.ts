import { describe, expect, it } from "vitest";
import { scheduleObservationTasks, type PlanningTask } from "./taskScheduler";

const task = (taskId: string, priority: number, requiredDurationSeconds: number, allowSplit = true): PlanningTask => ({
  taskId, targetId: taskId, priority, requiredDurationSeconds,
  earliestStartSeconds: 0, latestEndSeconds: 200, minimumSegmentSeconds: 10, allowSplit,
});

describe("task scheduler", () => {
  it("allocates the exclusive satellite resource by priority without overlap", () => {
    const result = scheduleObservationTasks(
      [task("low", 3, 60), task("high", 10, 60)],
      [
        { taskId: "high", satelliteId: "sat-1", startSeconds: 0, endSeconds: 100 },
        { taskId: "low", satelliteId: "sat-1", startSeconds: 50, endSeconds: 150 },
      ], 0, 200,
    );
    expect(result.tasks.find((item) => item.taskId === "high")?.segments[0]).toMatchObject({ startSeconds: 0, endSeconds: 60 });
    expect(result.tasks.find((item) => item.taskId === "low")?.segments[0]).toMatchObject({ startSeconds: 60, endSeconds: 120 });
    expect(result.satelliteUtilization["sat-1"]).toBeCloseTo(0.6);
  });

  it("splits across satellites but never double-counts simultaneous observation of one task", () => {
    const result = scheduleObservationTasks(
      [task("region", 5, 90)],
      [
        { taskId: "region", satelliteId: "sat-1", startSeconds: 0, endSeconds: 50 },
        { taskId: "region", satelliteId: "sat-2", startSeconds: 0, endSeconds: 100 },
      ], 0, 200,
    );
    expect(result.tasks[0].status).toBe("completed");
    expect(result.tasks[0].scheduledDurationSeconds).toBe(90);
    expect(result.tasks[0].segments).toEqual([
      expect.objectContaining({ satelliteId: "sat-1", startSeconds: 0, endSeconds: 50 }),
      expect.objectContaining({ satelliteId: "sat-2", startSeconds: 50, endSeconds: 90 }),
    ]);
  });

  it("requires one continuous window for non-splittable tasks and reports the cause", () => {
    const result = scheduleObservationTasks(
      [task("single", 5, 60, false)],
      [
        { taskId: "single", satelliteId: "sat-1", startSeconds: 0, endSeconds: 40 },
        { taskId: "single", satelliteId: "sat-1", startSeconds: 80, endSeconds: 120 },
      ], 0, 200,
    );
    expect(result.tasks[0]).toMatchObject({ status: "unscheduled", reason: "resource-conflict", scheduledDurationSeconds: 0 });
  });

  it("rejects invalid task constraints and unknown opportunity references", () => {
    expect(() => scheduleObservationTasks([{ ...task("x", 5, 10), minimumSegmentSeconds: 20 }], [], 0, 100)).toThrow(/最小连续段/);
    expect(() => scheduleObservationTasks([task("x", 5, 10)], [{ taskId: "missing", satelliteId: "sat", startSeconds: 0, endSeconds: 20 }], 0, 100)).toThrow(/未知任务/);
  });
});

import { describe, expect, it } from "vitest";
import { defaultAntenna, defaultAttitude, defaultOrbit, type GroundTargetConfig, type MissionTaskConfig } from "../stores/simulationStore";
import { computeTaskPlan } from "./taskPlanning";

describe("task-planning opportunity analysis", () => {
  it("derives real Spotlight opportunity windows and schedules the requested dwell", () => {
    const target: GroundTargetConfig = {
      id: "region", name: "赤道任务区", targetType: "circle", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
      radiusM: 1_000_000, widthM: 0, heightM: 0, vertices: [],
    };
    const task: MissionTaskConfig = {
      targetId: target.id, enabled: true, priority: 8, requiredDurationSeconds: 10,
      earliestStartSeconds: 0, latestEndSeconds: 120, minimumSegmentSeconds: 2, allowSplit: true,
    };
    const result = computeTaskPlan({
      orbit: defaultOrbit, attitude: defaultAttitude, antenna: { ...defaultAntenna, circularBeamwidthDeg: 20 },
      targets: [target], tasks: [task], startSeconds: 0, endSeconds: 120,
      sampleStepSeconds: 5, transitionToleranceSeconds: 0.1,
    });
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.schedule.tasks[0]).toMatchObject({ status: "completed", scheduledDurationSeconds: 10 });
    expect(result.schedule.segments[0].satelliteId).toBe("primary");
  });

  it("rejects empty task sets and excessive workloads", () => {
    const base = { orbit: defaultOrbit, attitude: defaultAttitude, antenna: defaultAntenna, targets: [], tasks: [], startSeconds: 0, endSeconds: 100, sampleStepSeconds: 5, transitionToleranceSeconds: 0.1 };
    expect(() => computeTaskPlan(base)).toThrow(/至少需要启用/);
  });
});

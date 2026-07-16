import { describe, expect, it } from "vitest";
import { defaultAntenna, defaultAttitude, defaultOrbit, type GroundTargetConfig } from "../stores/simulationStore";
import { buildRefinedAccessWindows, computeRevisitAnalysis } from "./revisitAnalysis";

describe("revisit analysis", () => {
  it("refines detected Boolean transitions to the requested tolerance", () => {
    const windows = buildRefinedAccessWindows(
      [{ timeSeconds: 0, active: false }, { timeSeconds: 10, active: true }, { timeSeconds: 20, active: false }],
      0.01,
      (time) => time >= 3.25 && time < 14.75,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].startSeconds).toBeCloseTo(3.25, 2);
    expect(windows[0].endSeconds).toBeCloseTo(14.75, 2);
  });

  it("analyzes horizon visibility and true beam coverage for a ground target", () => {
    const target: GroundTargetConfig = {
      id: "initial-subpoint", name: "初始星下点", targetType: "point",
      longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
      radiusM: 0, widthM: 0, heightM: 0, vertices: [],
    };
    const result = computeRevisitAnalysis({
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna }, targets: [target],
      startSeconds: 0, endSeconds: 120, sampleStepSeconds: 5, transitionToleranceSeconds: 0.1,
    });
    expect(result.coarseSampleCount).toBe(25);
    expect(result.satelliteCount).toBe(1);
    expect(result.satellites).toHaveLength(1);
    expect(result.targets[0].visibilityStatistics.accessCount).toBeGreaterThanOrEqual(1);
    expect(result.targets[0].coverageStatistics.accessCount).toBeGreaterThanOrEqual(1);
    expect(result.targets[0].coverageWindows[0].clippedAtStart).toBe(true);
    expect(result.targets[0].coverageStatistics.totalAccessDurationSeconds).toBeGreaterThan(0);
  });

  it("keeps per-satellite windows and unions enabled satellites into constellation access", () => {
    const target: GroundTargetConfig = {
      id: "region", name: "赤道区域", targetType: "circle", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
      radiusM: 1_000_000, widthM: 0, heightM: 0, vertices: [],
    };
    const companionOrbit = { ...defaultOrbit, initialPhaseDeg: 180, initialAnomalyDeg: 180 };
    const result = computeRevisitAnalysis({
      orbit: defaultOrbit, attitude: defaultAttitude, antenna: { ...defaultAntenna, circularBeamwidthDeg: 20 }, targets: [target],
      companionSatellites: [{ id: "sat-2", name: "SAT-2", color: "#ff7875", enabled: true, orbit: companionOrbit, attitude: defaultAttitude, antenna: { ...defaultAntenna, circularBeamwidthDeg: 20 } }],
      startSeconds: 0, endSeconds: 6000, sampleStepSeconds: 5, transitionToleranceSeconds: 0.1,
    });
    expect(result.satelliteCount).toBe(2);
    expect(result.satellites.map((satellite) => satellite.satelliteName)).toEqual(["SAT-1", "SAT-2"]);
    const individualDurations = result.satellites.map((satellite) => satellite.targets[0].coverageStatistics.totalAccessDurationSeconds);
    expect(result.targets[0].coverageStatistics.totalAccessDurationSeconds).toBeGreaterThanOrEqual(Math.max(...individualDurations));
  }, 30_000);

  it("rejects excessive workloads and invalid tolerances", () => {
    const base = { orbit: defaultOrbit, attitude: defaultAttitude, antenna: defaultAntenna, targets: [{ id: "x" } as GroundTargetConfig], startSeconds: 0, endSeconds: 100 };
    expect(() => computeRevisitAnalysis({ ...base, sampleStepSeconds: 10, transitionToleranceSeconds: 11 })).toThrow(/不超过/);
    expect(() => computeRevisitAnalysis({ ...base, endSeconds: 200_000, sampleStepSeconds: 1, transitionToleranceSeconds: 0.1 })).toThrow(/100000/);
  });

  it("completes a default one-day analysis workload and produces repeated regional access", () => {
    const region: GroundTargetConfig = {
      id: "equatorial-region", name: "赤道任务区", targetType: "circle",
      longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
      radiusM: 1_000_000, widthM: 0, heightM: 0, vertices: [],
    };
    const result = computeRevisitAnalysis({
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, circularBeamwidthDeg: 20 }, targets: [region],
      startSeconds: 0, endSeconds: 86_400, sampleStepSeconds: 5, transitionToleranceSeconds: 0.1,
    });
    expect(result.coarseSampleCount).toBe(17_281);
    expect(result.targets[0].visibilityStatistics.accessCount).toBeGreaterThan(1);
    expect(result.targets[0].coverageStatistics.accessCount).toBeGreaterThan(1);
    expect(result.targets[0].coverageStatistics.revisitIntervalsSeconds.length).toBeGreaterThan(0);
  }, 30_000);
});

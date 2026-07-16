import { describe, expect, it } from "vitest";
import { bodyFromLvlhQuaternion, DEG_TO_RAD } from "@spacedrone/orbital-core";
import {
  defaultAntenna,
  defaultAttitude,
  defaultOrbit,
} from "../stores/simulationStore";
import { computeSimulationSamples } from "./simulationSampling";

describe("fixed-time simulation sampling", () => {
  it("采样一周轨道并可计算波束中心和覆盖区", () => {
    const result = computeSimulationSamples({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: defaultAntenna,
      includeCoverage: true,
      sampleCount: 9,
    });
    expect(result.samples).toHaveLength(9);
    expect(result.samples[0].timeSeconds).toBe(0);
    expect(result.samples[8].timeSeconds).toBeCloseTo(result.periodSeconds, 9);
    expect(result.samples[0].beamCenter).toBeDefined();
    expect(result.samples[0].coverageVertices?.length).toBe(96);
    expect(result.samples[0].attitudeQuaternion).toEqual([0, 0, 0, 1]);
    expect(result.samples[0].slantRangeM).toBeCloseTo(500_000, 2);
    expect(result.samples[0].footprintGeoJson?.coordinates[0][0]).toEqual(
      result.samples[0].footprintGeoJson?.coordinates[0].at(-1),
    );
    expect(result.samples[0].satellite.longitudeDeg).toBeCloseTo(67.1379, 3);
  });

  it("拒绝过小时间步导致的超大任务", () => {
    expect(() => computeSimulationSamples({ orbit: defaultOrbit, sampleCount: 10_001 })).toThrow(
      /10000/,
    );
  });

  it("关闭地球自转后一周末端经度返回初始值", () => {
    const fixedEarth = computeSimulationSamples({
      orbit: { ...defaultOrbit, earthRotationEnabled: false },
      sampleCount: 3,
    });
    const rotatingEarth = computeSimulationSamples({ orbit: defaultOrbit, sampleCount: 3 });
    expect(fixedEarth.samples.at(-1)!.satellite.longitudeDeg).toBeCloseTo(
      fixedEarth.samples[0].satellite.longitudeDeg,
      8,
    );
    expect(Math.abs(rotatingEarth.samples.at(-1)!.satellite.longitudeDeg - rotatingEarth.samples[0].satellite.longitudeDeg)).toBeGreaterThan(1);
  });

  it("Worker 采样导出外部序列对应的时变姿态四元数", () => {
    const result = computeSimulationSamples({
      orbit: defaultOrbit,
      attitude: {
        ...defaultAttitude,
        mode: "external",
        sequence: [
          { timeSeconds: 0, rollDeg: 0, pitchDeg: 0, yawDeg: 0 },
          { timeSeconds: 10, rollDeg: 10, pitchDeg: 20, yawDeg: 30 },
        ],
      },
      sampleCount: 3,
      startSeconds: 0,
      endSeconds: 10,
    });
    const expected = bodyFromLvlhQuaternion({
      rollRad: 5 * DEG_TO_RAD,
      pitchRad: 10 * DEG_TO_RAD,
      yawRad: 15 * DEG_TO_RAD,
    });
    result.samples[1].attitudeQuaternion.forEach((component, index) => {
      expect(component).toBeCloseTo(expected[index], 14);
    });
  });

  it("覆盖采样保留全部启用馈源的逐波束几何", () => {
    const result = computeSimulationSamples({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: {
        ...defaultAntenna,
        arrayFeeds: [{
          id: "feed-2", name: "FEED-2", enabled: true,
          offsetXM: 0.2, offsetYM: 0, offsetZM: 0,
          steeringAzimuthOffsetDeg: 6, steeringElevationOffsetDeg: 0,
          beamwidthScale: 1, relativePowerDb: -2, color: "#ff7875",
        }],
      },
      includeCoverage: true,
      sampleCount: 2,
    });
    expect(result.samples[0].beams).toHaveLength(2);
    expect(result.samples[0].beams?.[1]).toMatchObject({
      beamId: "feed-2",
      beamName: "FEED-2",
      relativePowerDb: -2,
    });
    expect(result.samples[0].beams?.[1].vertices?.length).toBe(defaultAntenna.boundarySamples);
  });
});

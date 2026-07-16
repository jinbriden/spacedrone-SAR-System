import { describe, expect, it } from "vitest";
import { DEG_TO_RAD } from "../constants";
import { angularDirectionAntenna } from "./beam";
import {
  createScanSarSteeringLaw,
  createTopsSteeringLaw,
  directionToAngularCoordinatesAntenna,
} from "./taskModes";

describe("SAR task steering modes", () => {
  it("ScanSAR 按 burst 驻留时间循环切换子测绘带", () => {
    const law = createScanSarSteeringLaw({
      azimuthRad: 2 * DEG_TO_RAD,
      elevationAnglesRad: [-20, 0, 20].map((value) => value * DEG_TO_RAD),
      burstDurationSeconds: 5,
    });
    expect(law.getSteeringAngles(0).elevationRad).toBeCloseTo(-20 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(5).elevationRad).toBeCloseTo(0, 12);
    expect(law.getSteeringAngles(10).elevationRad).toBeCloseTo(20 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(15).elevationRad).toBeCloseTo(-20 * DEG_TO_RAD, 12);
  });

  it("TOPS 在每个周期内从起始角单向扫到结束角后复位", () => {
    const law = createTopsSteeringLaw({
      startAzimuthRad: -15 * DEG_TO_RAD,
      endAzimuthRad: 15 * DEG_TO_RAD,
      elevationRad: 3 * DEG_TO_RAD,
      sweepDurationSeconds: 10,
    });
    expect(law.getSteeringAngles(0).azimuthRad).toBeCloseTo(-15 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(5).azimuthRad).toBeCloseTo(0, 12);
    expect(law.getSteeringAngles(9).azimuthRad).toBeCloseTo(12 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(10).azimuthRad).toBeCloseTo(-15 * DEG_TO_RAD, 12);
  });

  it("天线方向与角域正反变换一致并拒绝后半球目标", () => {
    const direction = angularDirectionAntenna(12 * DEG_TO_RAD, -8 * DEG_TO_RAD);
    const angles = directionToAngularCoordinatesAntenna(direction);
    expect(angles.azimuthRad).toBeCloseTo(12 * DEG_TO_RAD, 12);
    expect(angles.elevationRad).toBeCloseTo(-8 * DEG_TO_RAD, 12);
    expect(() => directionToAngularCoordinatesAntenna([0, 0, -1])).toThrow(/后半球/);
  });
});

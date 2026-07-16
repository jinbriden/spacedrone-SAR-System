import { describe, expect, it } from "vitest";
import { DEG_TO_RAD } from "../constants";
import { dot } from "../math/vector";
import {
  angularDirectionAntenna,
  sampleCircularBeamBoundary,
  sampleRectangularBeamBoundary,
} from "./beam";

describe("beam boundary sampling", () => {
  it("圆锥边界生成指定数量且每条射线距中心为半波束宽度", () => {
    const center = angularDirectionAntenna(12 * DEG_TO_RAD, -8 * DEG_TO_RAD);
    const boundary = sampleCircularBeamBoundary({
      steeringAzimuthRad: 12 * DEG_TO_RAD,
      steeringElevationRad: -8 * DEG_TO_RAD,
      fullBeamwidthRad: 6 * DEG_TO_RAD,
      sampleCount: 96,
    });
    expect(boundary).toHaveLength(96);
    for (const direction of boundary) {
      const separationRad = Math.acos(Math.max(-1, Math.min(1, dot(center, direction))));
      expect(separationRad).toBeCloseTo(3 * DEG_TO_RAD, 12);
    }
  });

  it("矩形角域沿四条边连续采样并达到规定角宽", () => {
    const boundary = sampleRectangularBeamBoundary({
      steeringAzimuthRad: 0,
      steeringElevationRad: 0,
      azimuthFullBeamwidthRad: 4 * DEG_TO_RAD,
      elevationFullBeamwidthRad: 8 * DEG_TO_RAD,
      sampleCount: 96,
    });
    const azimuths = boundary.map((direction) => Math.atan2(direction[0], direction[2]));
    const elevations = boundary.map((direction) => Math.atan2(direction[1], direction[2]));
    expect(boundary).toHaveLength(96);
    expect(Math.min(...azimuths)).toBeCloseTo(-2 * DEG_TO_RAD, 12);
    expect(Math.max(...azimuths)).toBeCloseTo(2 * DEG_TO_RAD, 12);
    expect(Math.min(...elevations)).toBeCloseTo(-4 * DEG_TO_RAD, 12);
    expect(Math.max(...elevations)).toBeCloseTo(4 * DEG_TO_RAD, 12);
  });

  it("拒绝过少采样点和非法角度", () => {
    expect(() =>
      sampleCircularBeamBoundary({
        steeringAzimuthRad: 0,
        steeringElevationRad: 0,
        fullBeamwidthRad: 6 * DEG_TO_RAD,
        sampleCount: 3,
      }),
    ).toThrow(/采样数/);
    expect(() => angularDirectionAntenna(90 * DEG_TO_RAD, 0)).toThrow(/89 deg/);
  });
});

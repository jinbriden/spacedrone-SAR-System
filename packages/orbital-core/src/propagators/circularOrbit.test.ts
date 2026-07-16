import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, WGS84_SEMI_MAJOR_AXIS_M } from "../constants";
import { magnitude, subtract } from "../math/vector";
import {
  CircularOrbitPropagator,
  circularOrbitPeriodSeconds,
  circularOrbitSpeedMps,
} from "./circularOrbit";

describe("circular orbit", () => {
  it("500 km 圆轨道速度由半径和引力参数唯一确定", () => {
    expect(circularOrbitSpeedMps(500_000)).toBeCloseTo(7612.61, 1);
  });

  it("500 km 圆轨道周期约为 94.6 min", () => {
    expect(circularOrbitPeriodSeconds(500_000) / 60).toBeCloseTo(94.62, 1);
  });

  it("传播一周后回到初始位置且半径、速度保持不变", () => {
    const propagator = new CircularOrbitPropagator({
      altitudeM: 500_000,
      inclinationRad: 97.4 * DEG_TO_RAD,
      raanRad: 37 * DEG_TO_RAD,
      initialPhaseRad: 12 * DEG_TO_RAD,
    });
    const initial = propagator.propagate(0);
    const final = propagator.propagate(propagator.periodSeconds);

    expect(magnitude(subtract(final.positionEciM, initial.positionEciM))).toBeLessThan(1e-7);
    expect(magnitude(final.positionEciM)).toBeCloseTo(
      WGS84_SEMI_MAJOR_AXIS_M + 500_000,
      6,
    );
    expect(magnitude(final.velocityEciMps)).toBeCloseTo(propagator.speedMps, 8);
  });

  it("拒绝非物理轨道高度", () => {
    expect(() => circularOrbitSpeedMps(0)).toThrow(/高度/);
    expect(() => circularOrbitPeriodSeconds(-1)).toThrow(/高度/);
  });
});

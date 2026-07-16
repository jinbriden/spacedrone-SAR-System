import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, EARTH_GRAVITATIONAL_PARAMETER_M3_S2 } from "../constants";
import { magnitude } from "../math/vector";
import { KeplerianOrbitPropagator, solveEccentricAnomalyRad } from "./keplerianOrbit";

describe("KeplerianOrbitPropagator", () => {
  const parameters = {
    semiMajorAxisM: 7_200_000,
    eccentricity: 0.05,
    inclinationRad: 63.4 * DEG_TO_RAD,
    raanRad: 20 * DEG_TO_RAD,
    argumentOfPeriapsisRad: 40 * DEG_TO_RAD,
    initialAnomalyRad: 10 * DEG_TO_RAD,
    anomalyType: "mean" as const,
  };

  it("传播一周后返回初始状态", () => {
    const propagator = new KeplerianOrbitPropagator(parameters);
    const initial = propagator.propagate(0);
    const afterPeriod = propagator.propagate(propagator.periodSeconds);
    expect(magnitude([
      afterPeriod.positionEciM[0] - initial.positionEciM[0],
      afterPeriod.positionEciM[1] - initial.positionEciM[1],
      afterPeriod.positionEciM[2] - initial.positionEciM[2],
    ])).toBeLessThan(1e-5);
  });

  it("满足轨道比机械能常数", () => {
    const propagator = new KeplerianOrbitPropagator(parameters);
    for (const fraction of [0, 0.25, 0.5, 0.75]) {
      const state = propagator.propagate(fraction * propagator.periodSeconds);
      const energy = magnitude(state.velocityEciMps) ** 2 / 2
        - EARTH_GRAVITATIONAL_PARAMETER_M3_S2 / magnitude(state.positionEciM);
      expect(energy).toBeCloseTo(-EARTH_GRAVITATIONAL_PARAMETER_M3_S2 / (2 * parameters.semiMajorAxisM), 5);
    }
  });

  it("开普勒方程残差接近零并拒绝地内近地点", () => {
    const eccentric = solveEccentricAnomalyRad(2.1, 0.7);
    expect(eccentric - 0.7 * Math.sin(eccentric)).toBeCloseTo(2.1, 12);
    expect(() => new KeplerianOrbitPropagator({ ...parameters, eccentricity: 0.2, semiMajorAxisM: 7_000_000 })).toThrow(/地球内部/);
  });
});

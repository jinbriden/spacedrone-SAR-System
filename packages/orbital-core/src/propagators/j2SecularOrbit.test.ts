import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, RAD_TO_DEG, WGS84_SEMI_MAJOR_AXIS_M } from "../constants";
import { magnitude, subtract } from "../math/vector";
import { KeplerianOrbitPropagator, type KeplerianOrbitParameters } from "./keplerianOrbit";
import { J2SecularOrbitPropagator, j2SecularRates } from "./j2SecularOrbit";

describe("J2 secular orbit propagation", () => {
  const parameters: KeplerianOrbitParameters = {
    semiMajorAxisM: WGS84_SEMI_MAJOR_AXIS_M + 500_000,
    eccentricity: 0.001,
    inclinationRad: 97.4 * DEG_TO_RAD,
    raanRad: 10 * DEG_TO_RAD,
    argumentOfPeriapsisRad: 20 * DEG_TO_RAD,
    initialAnomalyRad: 30 * DEG_TO_RAD,
    anomalyType: "mean",
  };

  it("近太阳同步倾角产生约每天一度的正向 RAAN 漂移", () => {
    const rateDegPerDay = j2SecularRates(parameters).raanRateRadS * RAD_TO_DEG * 86_400;
    expect(rateDegPerDay).toBeGreaterThan(0.9);
    expect(rateDegPerDay).toBeLessThan(1.1);
  });

  it("历元位置与二体模型一致，一天后出现可观测差异", () => {
    const twoBody = new KeplerianOrbitPropagator(parameters);
    const j2 = new J2SecularOrbitPropagator(parameters);
    expect(magnitude(subtract(j2.propagate(0).positionEciM, twoBody.propagate(0).positionEciM))).toBeLessThan(1e-6);
    expect(magnitude(subtract(j2.propagate(86_400).positionEciM, twoBody.propagate(86_400).positionEciM))).toBeGreaterThan(100_000);
  });

  it("返回速度与传播位置的中心差分一致", () => {
    const propagator = new J2SecularOrbitPropagator(parameters);
    const timeSeconds = 12_345;
    const halfStepSeconds = 0.01;
    const before = propagator.propagate(timeSeconds - halfStepSeconds).positionEciM;
    const after = propagator.propagate(timeSeconds + halfStepSeconds).positionEciM;
    const finiteDifferenceVelocity = subtract(after, before).map(
      (component) => component / (2 * halfStepSeconds),
    ) as [number, number, number];
    expect(magnitude(subtract(propagator.propagate(timeSeconds).velocityEciMps, finiteDifferenceVelocity))).toBeLessThan(0.01);
  });

  it("正好极轨时一阶 RAAN 世俗漂移为零", () => {
    const rates = j2SecularRates({ ...parameters, inclinationRad: Math.PI / 2 });
    expect(Math.abs(rates.raanRateRadS)).toBeLessThan(1e-18);
  });
});

import { describe, expect, it } from "vitest";
import { magnitude, subtract } from "@spacedrone/orbital-core";
import { defaultOrbit } from "../stores/simulationStore";
import { createConfiguredOrbitPropagator } from "./orbitFactory";

describe("configured orbit propagator", () => {
  it("圆轨道配置可切换 J2，历元重合而长期轨迹产生漂移", () => {
    const twoBody = createConfiguredOrbitPropagator({ ...defaultOrbit, propagationModel: "twoBody" });
    const j2 = createConfiguredOrbitPropagator({ ...defaultOrbit, propagationModel: "j2Secular" });
    expect(magnitude(subtract(twoBody.propagate(0).positionEciM, j2.propagate(0).positionEciM))).toBeLessThan(1e-6);
    expect(magnitude(subtract(twoBody.propagate(86_400).positionEciM, j2.propagate(86_400).positionEciM))).toBeGreaterThan(100_000);
  });

  it("开普勒六根数 J2 配置返回有限状态", () => {
    const propagator = createConfiguredOrbitPropagator({
      ...defaultOrbit,
      mode: "keplerian",
      propagationModel: "j2Secular",
      eccentricity: 0.01,
      semiMajorAxisM: 7_000_000,
    });
    const state = propagator.propagate(12_345);
    expect([...state.positionEciM, ...state.velocityEciMps].every(Number.isFinite)).toBe(true);
  });
});

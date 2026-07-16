import { describe, expect, it } from "vitest";
import { DEG_TO_RAD } from "../constants";
import { createBeamSteeringLaw } from "./steering";

describe("beam steering laws", () => {
  const base = {
    axis: "azimuth" as const,
    baseAzimuthRad: 5 * DEG_TO_RAD,
    baseElevationRad: -2 * DEG_TO_RAD,
    amplitudeRad: 10 * DEG_TO_RAD,
    periodSeconds: 20,
  };

  it("固定模式始终返回基础角", () => {
    const law = createBeamSteeringLaw({ ...base, mode: "fixed" });
    expect(law.getSteeringAngles(0).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(123).elevationRad).toBeCloseTo(-2 * DEG_TO_RAD, 12);
  });

  it("正弦扫描按周期在正负幅度间变化", () => {
    const law = createBeamSteeringLaw({ ...base, mode: "sine" });
    expect(law.getSteeringAngles(0).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(5).azimuthRad).toBeCloseTo(15 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(15).azimuthRad).toBeCloseTo(-5 * DEG_TO_RAD, 12);
  });

  it("线性往返扫描形成连续三角波", () => {
    const law = createBeamSteeringLaw({ ...base, mode: "linear" });
    expect(law.getSteeringAngles(0).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(5).azimuthRad).toBeCloseTo(15 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(10).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(15).azimuthRad).toBeCloseTo(-5 * DEG_TO_RAD, 12);
  });

  it("可沿俯仰轴扫描并拒绝非法周期", () => {
    const law = createBeamSteeringLaw({ ...base, mode: "sine", axis: "elevation" });
    expect(law.getSteeringAngles(5).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(5).elevationRad).toBeCloseTo(8 * DEG_TO_RAD, 12);
    expect(() => createBeamSteeringLaw({ ...base, mode: "linear", periodSeconds: 0 })).toThrow(
      /周期/,
    );
  });

  it("自定义时间表线性插值并在两端保持", () => {
    const law = createBeamSteeringLaw({
      ...base,
      mode: "custom",
      tableSamples: [
        { timeSeconds: 10, azimuthRad: -10 * DEG_TO_RAD, elevationRad: 2 * DEG_TO_RAD },
        { timeSeconds: 20, azimuthRad: 20 * DEG_TO_RAD, elevationRad: -8 * DEG_TO_RAD },
      ],
    });
    expect(law.getSteeringAngles(0).azimuthRad).toBeCloseTo(-10 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(15).azimuthRad).toBeCloseTo(5 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(15).elevationRad).toBeCloseTo(-3 * DEG_TO_RAD, 12);
    expect(law.getSteeringAngles(30).elevationRad).toBeCloseTo(-8 * DEG_TO_RAD, 12);
  });

  it("自定义时间表拒绝点数不足和非递增时间", () => {
    expect(() => createBeamSteeringLaw({
      ...base,
      mode: "custom",
      tableSamples: [{ timeSeconds: 0, azimuthRad: 0, elevationRad: 0 }],
    })).toThrow(/至少需要 2/);
    expect(() => createBeamSteeringLaw({
      ...base,
      mode: "custom",
      tableSamples: [
        { timeSeconds: 1, azimuthRad: 0, elevationRad: 0 },
        { timeSeconds: 1, azimuthRad: 0, elevationRad: 0 },
      ],
    })).toThrow(/严格递增/);
  });
});

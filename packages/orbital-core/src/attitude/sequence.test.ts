import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, RAD_TO_DEG } from "../constants";
import { createAttitudeLaw } from "./sequence";

describe("external attitude sequence", () => {
  const fixed = { rollRad: 1 * DEG_TO_RAD, pitchRad: 2 * DEG_TO_RAD, yawRad: 3 * DEG_TO_RAD };

  it("固定模式返回固定 RPY", () => {
    expect(createAttitudeLaw({ mode: "fixed", fixed }).getAttitude(100)).toEqual(fixed);
  });

  it("外部序列插值并在范围外保持端点", () => {
    const law = createAttitudeLaw({
      mode: "external",
      fixed,
      samples: [
        { timeSeconds: 10, rollRad: 0, pitchRad: -10 * DEG_TO_RAD, yawRad: 20 * DEG_TO_RAD },
        { timeSeconds: 20, rollRad: 10 * DEG_TO_RAD, pitchRad: 10 * DEG_TO_RAD, yawRad: 40 * DEG_TO_RAD },
      ],
    });
    expect(law.getAttitude(0).pitchRad * RAD_TO_DEG).toBeCloseTo(-10, 12);
    expect(law.getAttitude(15).rollRad * RAD_TO_DEG).toBeCloseTo(5, 12);
    expect(law.getAttitude(30).yawRad * RAD_TO_DEG).toBeCloseTo(40, 12);
  });

  it("跨越正负 180 度时沿最短角路径插值", () => {
    const law = createAttitudeLaw({
      mode: "external",
      fixed,
      samples: [
        { timeSeconds: 0, rollRad: 170 * DEG_TO_RAD, pitchRad: 0, yawRad: 170 * DEG_TO_RAD },
        { timeSeconds: 10, rollRad: -170 * DEG_TO_RAD, pitchRad: 0, yawRad: -170 * DEG_TO_RAD },
      ],
    });
    expect(Math.abs(law.getAttitude(5).yawRad * RAD_TO_DEG)).toBeCloseTo(180, 12);
  });

  it("拒绝不足两点和非递增时间", () => {
    expect(() => createAttitudeLaw({ mode: "external", fixed, samples: [] })).toThrow(/至少需要 2/);
    expect(() => createAttitudeLaw({
      mode: "external",
      fixed,
      samples: [
        { timeSeconds: 1, rollRad: 0, pitchRad: 0, yawRad: 0 },
        { timeSeconds: 1, rollRad: 0, pitchRad: 0, yawRad: 0 },
      ],
    })).toThrow(/严格递增/);
  });
});

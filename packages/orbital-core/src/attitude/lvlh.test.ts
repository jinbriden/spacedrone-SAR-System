import { describe, expect, it } from "vitest";
import { cross, dot, magnitude, subtract } from "../math/vector";
import { buildLvlhFrame } from "./lvlh";

describe("LVLH frame", () => {
  it("构造正交归一右手基，且 +Z 指向地心", () => {
    const frame = buildLvlhFrame([7_000_000, 0, 0], [120, 7_500, 300]);

    expect(magnitude(frame.x)).toBeCloseTo(1, 12);
    expect(magnitude(frame.y)).toBeCloseTo(1, 12);
    expect(magnitude(frame.z)).toBeCloseTo(1, 12);
    expect(dot(frame.x, frame.y)).toBeCloseTo(0, 12);
    expect(dot(frame.y, frame.z)).toBeCloseTo(0, 12);
    expect(dot(frame.z, frame.x)).toBeCloseTo(0, 12);
    expect(magnitude(subtract(frame.z, [-1, 0, 0]))).toBeLessThan(1e-12);
    expect(magnitude(subtract(cross(frame.x, frame.y), frame.z))).toBeLessThan(1e-12);
  });

  it("先剔除速度径向分量再定义 +X", () => {
    const frame = buildLvlhFrame([7_000_000, 0, 0], [2_000, 7_500, 0]);
    expect(frame.x[0]).toBeCloseTo(0, 12);
    expect(frame.x[1]).toBeCloseTo(1, 12);
  });

  it("拒绝无法定义沿航迹方向的退化状态", () => {
    expect(() => buildLvlhFrame([7_000_000, 0, 0], [1_000, 0, 0])).toThrow(
      /归一化/,
    );
  });
});

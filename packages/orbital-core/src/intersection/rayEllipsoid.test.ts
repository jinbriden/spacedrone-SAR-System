import { describe, expect, it } from "vitest";
import { WGS84_SEMI_MAJOR_AXIS_M } from "../constants";
import { intersectRayWgs84, wgs84EllipsoidEquationValue } from "./rayEllipsoid";

describe("ray/WGS84 ellipsoid intersection", () => {
  const satellite = [WGS84_SEMI_MAJOR_AXIS_M + 500_000, 0, 0] as const;

  it("天底射线取最小正根并命中星下点", () => {
    const intersection = intersectRayWgs84(satellite, [-10, 0, 0]);
    expect(intersection).toBeDefined();
    expect(intersection!.distanceM).toBeCloseTo(500_000, 6);
    expect(intersection!.pointEcefM[0]).toBeCloseTo(WGS84_SEMI_MAJOR_AXIS_M, 6);
    expect(intersection!.pointEcefM[1]).toBeCloseTo(0, 12);
    expect(wgs84EllipsoidEquationValue(intersection!.pointEcefM)).toBeCloseTo(1, 12);
  });

  it("指向地球外侧时返回无交点", () => {
    expect(intersectRayWgs84(satellite, [1, 0, 0])).toBeUndefined();
  });

  it("所有有效交点均满足 WGS84 椭球方程", () => {
    const intersection = intersectRayWgs84(satellite, [-1, 0.05, 0.02]);
    expect(intersection).toBeDefined();
    expect(wgs84EllipsoidEquationValue(intersection!.pointEcefM)).toBeCloseTo(1, 11);
  });
});

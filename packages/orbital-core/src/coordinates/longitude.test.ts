import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, RAD_TO_DEG } from "../constants";
import { crossesAntimeridian, unwrapLongitudesRad } from "./longitude";

describe("antimeridian handling", () => {
  it("识别跨日界线并展开为连续经度", () => {
    const input = [179, -179, -178, 178].map((value) => value * DEG_TO_RAD);
    expect(crossesAntimeridian(input)).toBe(true);
    const unwrappedDeg = unwrapLongitudesRad(input).map((value) => value * RAD_TO_DEG);
    [179, 181, 182, 178].forEach((expected, index) =>
      expect(unwrappedDeg[index]).toBeCloseTo(expected, 10),
    );
  });

  it("普通区域不误报跨日界线", () => {
    expect(crossesAntimeridian([100, 101, 102].map((value) => value * DEG_TO_RAD))).toBe(
      false,
    );
  });
});

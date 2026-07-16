import { describe, expect, it } from "vitest";
import { parseNaturalEarthBorderRings } from "./naturalEarthBorders";

describe("Natural Earth border parsing", () => {
  it("只提取 Polygon 和 MultiPolygon 的边界坐标，不保留要素属性", () => {
    const rings = parseNaturalEarthBorderRings({
      type: "FeatureCollection",
      features: [
        { properties: { many: "ignored" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 0]]] } },
        { geometry: { type: "MultiPolygon", coordinates: [[[[10, 10], [11, 10], [10, 10]]]] } },
      ],
    });
    expect(rings).toEqual([
      [[0, 0], [1, 0], [0, 0]],
      [[10, 10], [11, 10], [10, 10]],
    ]);
  });

  it("拒绝没有有效边界的数据", () => {
    expect(() => parseNaturalEarthBorderRings({ features: [] })).toThrow(/没有有效/);
  });
});

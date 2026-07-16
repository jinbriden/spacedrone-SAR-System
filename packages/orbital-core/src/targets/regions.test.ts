import { describe, expect, it } from "vitest";
import { geodeticRegionsIntersect, sampleCircularTargetRegion, sampleRectangularTargetRegion } from "./regions";

describe("ground task regions", () => {
  it("samples circle and local east/north rectangle around their center", () => {
    const circle = sampleCircularTargetRegion({ longitudeDeg: 0, latitudeDeg: 0 }, 100_000, 64);
    expect(circle).toHaveLength(64);
    expect(Math.max(...circle.map((point) => point.longitudeDeg))).toBeCloseTo(0.8983, 3);
    const rectangle = sampleRectangularTargetRegion({ longitudeDeg: 10, latitudeDeg: 20 }, 200_000, 100_000);
    expect(rectangle).toHaveLength(4);
    expect(Math.min(...rectangle.map((point) => point.latitudeDeg))).toBeLessThan(20);
    expect(Math.max(...rectangle.map((point) => point.latitudeDeg))).toBeGreaterThan(20);
  });

  it("detects overlap even when neither region center lies inside the other", () => {
    const first = [{ longitudeDeg: 0, latitudeDeg: 0 }, { longitudeDeg: 2, latitudeDeg: 0 }, { longitudeDeg: 2, latitudeDeg: 1 }, { longitudeDeg: 0, latitudeDeg: 1 }];
    const second = [{ longitudeDeg: 1.5, latitudeDeg: -1 }, { longitudeDeg: 2.5, latitudeDeg: -1 }, { longitudeDeg: 2.5, latitudeDeg: 2 }, { longitudeDeg: 1.5, latitudeDeg: 2 }];
    expect(geodeticRegionsIntersect(first, second)).toBe(true);
    expect(geodeticRegionsIntersect(first, second.map((point) => ({ ...point, longitudeDeg: point.longitudeDeg + 10 })))).toBe(false);
  });
});

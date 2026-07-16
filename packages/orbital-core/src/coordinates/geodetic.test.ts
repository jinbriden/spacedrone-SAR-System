import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, RAD_TO_DEG } from "../constants";
import { ecefToGeodetic, geodeticToEcef } from "./geodetic";

function angularDifferenceDeg(leftDeg: number, rightDeg: number): number {
  return Math.abs((((leftDeg - rightDeg) % 360) + 540) % 360 - 180);
}

describe("WGS84 geodetic/ECEF conversion", () => {
  const cases = [
    { name: "赤道", longitudeDeg: 0, latitudeDeg: 0, altitudeM: 0 },
    { name: "北极", longitudeDeg: 0, latitudeDeg: 90, altitudeM: 1500 },
    { name: "南极", longitudeDeg: 0, latitudeDeg: -90, altitudeM: 20 },
    { name: "日界线东侧", longitudeDeg: 179.999, latitudeDeg: 10, altitudeM: 500_000 },
    { name: "日界线西侧", longitudeDeg: -179.999, latitudeDeg: -45, altitudeM: 120 },
  ];

  it.each(cases)("$name 往返转换保持经纬高", (testCase) => {
    const ecefM = geodeticToEcef({
      longitudeRad: testCase.longitudeDeg * DEG_TO_RAD,
      latitudeRad: testCase.latitudeDeg * DEG_TO_RAD,
      altitudeM: testCase.altitudeM,
    });
    const result = ecefToGeodetic(ecefM);

    if (Math.abs(testCase.latitudeDeg) < 90) {
      expect(
        angularDifferenceDeg(result.longitudeRad * RAD_TO_DEG, testCase.longitudeDeg),
      ).toBeLessThan(1e-8);
    }
    expect(result.latitudeRad * RAD_TO_DEG).toBeCloseTo(testCase.latitudeDeg, 8);
    expect(result.altitudeM).toBeCloseTo(testCase.altitudeM, 4);
  });
});

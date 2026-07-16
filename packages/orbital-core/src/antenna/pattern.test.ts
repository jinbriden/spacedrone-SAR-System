import { describe, expect, it } from "vitest";
import { findPatternPeak, interpolatePatternGainDb, samplePatternGainBoundary, type AntennaGainPattern } from "./pattern";

const pattern: AntennaGainPattern = {
  name: "parabolic",
  azimuthAnglesDeg: [-10, -5, 0, 5, 10],
  elevationAnglesDeg: [-10, -5, 0, 5, 10],
  gainDb: [-10, -5, 0, 5, 10].map((elevation) =>
    [-10, -5, 0, 5, 10].map((azimuth) => -(azimuth * azimuth + elevation * elevation) / 25),
  ),
};

describe("2D antenna gain pattern", () => {
  it("finds the global peak and bilinearly interpolates gain", () => {
    expect(findPatternPeak(pattern)).toEqual({ azimuthDeg: 0, elevationDeg: 0, gainDb: 0 });
    expect(interpolatePatternGainDb(pattern, 2.5, 2.5)).toBeCloseTo(-1, 12);
    expect(interpolatePatternGainDb(pattern, 20, 0)).toBeUndefined();
  });

  it("extracts an ordered -3 dB main-lobe boundary", () => {
    const result = samplePatternGainBoundary({
      pattern,
      thresholdDbBelowPeak: 3,
      steeringAzimuthRad: 0,
      steeringElevationRad: 0,
      sampleCount: 64,
    });
    expect(result.directions).toHaveLength(64);
    expect(result.thresholdGainDb).toBe(-3);
    expect(result.clippedByPatternDomain).toBe(false);
    expect(result.angularBoundaryDeg[0].azimuthDeg).toBeCloseTo(25 / 3, 5);
    expect(result.angularBoundaryDeg[16].elevationDeg).toBeCloseTo(25 / 3, 5);
  });
});

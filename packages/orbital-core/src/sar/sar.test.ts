import { describe, expect, it } from "vitest";
import { deriveSarSystemParameters } from "./system";
import { computeSarRangeHistory } from "./rangeHistory";

describe("SAR system and range history", () => {
  const system = deriveSarSystemParameters({
    carrierFrequencyHz: 10e9,
    chirpBandwidthHz: 150e6,
    pulseWidthSeconds: 10e-6,
    prfHz: 2000,
    samplingRateHz: 200e6,
    apertureDurationSeconds: 1,
    fastTimeMarginSeconds: 1e-6,
  });

  it("derives wavelength, range resolution, ambiguity limits and sampling counts", () => {
    expect(system.wavelengthM).toBeCloseTo(0.0299792458, 10);
    expect(system.rangeResolutionM).toBeCloseTo(0.999308193, 8);
    expect(system.unambiguousRangeM).toBeCloseTo(74_948.1145, 4);
    expect(system.dutyCycle).toBeCloseTo(0.02, 12);
    expect(system.slowTimeSampleCount).toBe(2001);
    expect(() => deriveSarSystemParameters({ ...system, pulseWidthSeconds: 1e-3 })).toThrow(/乘积/);
  });

  it("produces symmetric range and Doppler history for a straight broadside pass", () => {
    const velocity = 100;
    const altitude = 1000;
    const result = computeSarRangeHistory([-1, 0, 1].map((slowTimeSeconds) => ({
      slowTimeSeconds,
      sensorPositionEcefM: [velocity * slowTimeSeconds, altitude, 0],
      sensorVelocityEcefMps: [velocity, 0, 0],
      targetPositionEcefM: [0, 0, 0],
    })), system);
    expect(result.closestApproach.slowTimeSeconds).toBe(0);
    expect(result.minimumRangeM).toBe(altitude);
    expect(result.samples[0].slantRangeM).toBeCloseTo(result.samples[2].slantRangeM, 12);
    expect(result.samples[0].dopplerHz).toBeCloseTo(-result.samples[2].dopplerHz, 12);
    expect(result.dopplerCentroidHz).toBeCloseTo(0, 12);
    expect(result.dopplerBandwidthHz).toBeGreaterThan(0);
    expect(result.fastTimeSampleCount).toBeGreaterThan(1);
  });
});

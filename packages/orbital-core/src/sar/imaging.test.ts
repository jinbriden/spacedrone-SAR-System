import { describe, expect, it } from "vitest";
import { SPEED_OF_LIGHT_M_S } from "../constants";
import { generateSarPointTargetEcho } from "./echo";
import { fftInPlace } from "./fft";
import { runSarImagingAlgorithm } from "./imaging";
import type { SarRangeHistorySample } from "./rangeHistory";
import { deriveSarSystemParameters } from "./system";

describe("SAR imaging interface and reference focusing", () => {
  it("round-trips a radix-2 complex FFT", () => {
    const real = Float64Array.from([1, 2, 3, 4, 0, 0, 0, 0]);
    const original = Array.from(real);
    const imag = new Float64Array(real.length);
    fftInPlace(real, imag);
    fftInPlace(real, imag, true);
    real.forEach((value, index) => expect(value).toBeCloseTo(original[index], 12));
    imag.forEach((value) => expect(value).toBeCloseTo(0, 12));
  });

  it("focuses a moving point target near the image center", () => {
    const system = deriveSarSystemParameters({
      carrierFrequencyHz: 1e9, chirpBandwidthHz: 2e6, pulseWidthSeconds: 8e-6,
      prfHz: 1000, samplingRateHz: 4e6, apertureDurationSeconds: 0.031,
      fastTimeMarginSeconds: 2e-6,
    });
    const pulseCount = 32;
    const slantRangeM = Float64Array.from({ length: pulseCount }, (_, index) => {
      const time = (index - pulseCount / 2) / system.prfHz;
      return 10_000 + 2e6 * time * time;
    });
    const samples: SarRangeHistorySample[] = Array.from(slantRangeM, (rangeM, index) => ({
      slowTimeSeconds: index / system.prfHz,
      sensorPositionEcefM: [rangeM, 0, 0],
      sensorVelocityEcefMps: [100, 0, 0],
      targetPositionEcefM: [0, 0, 0],
      slantRangeM: rangeM,
      rangeRateMps: 0,
      twoWayDelaySeconds: 2 * rangeM / SPEED_OF_LIGHT_M_S,
      dopplerHz: 0,
    }));
    const echo = generateSarPointTargetEcho(samples, system, {
      targetRcsM2: 1, noiseStandardDeviation: 0, foldRangeAmbiguity: false,
    });
    const image = runSarImagingAlgorithm("reference-range-backprojection", {
      ...echo,
      slantRangeM,
      system,
      maximumRangePixels: 96,
    });
    expect(image.azimuthPixelCount).toBe(pulseCount);
    expect(image.rangePixelCount).toBe(Math.min(96, echo.fastTimeSampleCount));
    expect(image.intensityDb[image.peakAzimuthIndex * image.rangePixelCount + image.peakRangeIndex]).toBeCloseTo(0, 5);
    expect(Math.abs(image.peakAzimuthIndex - Math.floor(pulseCount / 2))).toBeLessThanOrEqual(1);
    expect(image.rangeResolutionM).toBeGreaterThan(0);
    expect(image.algorithmId).toBe("reference-range-backprojection");
  });
});

import { describe, expect, it } from "vitest";
import { SPEED_OF_LIGHT_M_S } from "../constants";
import type { SarRangeHistorySample } from "./rangeHistory";
import { analyzeSarAmbiguities } from "./ambiguity";
import { generateSarPointTargetEcho } from "./echo";
import { deriveSarSystemParameters } from "./system";

describe("SAR LFM echo and ambiguities", () => {
  const system = deriveSarSystemParameters({
    carrierFrequencyHz: 1e9, chirpBandwidthHz: 1e6, pulseWidthSeconds: 4e-6,
    prfHz: 1000, samplingRateHz: 2e6, apertureDurationSeconds: 0.001,
    fastTimeMarginSeconds: 1e-6,
  });
  const sample = (slowTimeSeconds: number, rangeM: number, dopplerHz = 0): SarRangeHistorySample => ({
    slowTimeSeconds,
    sensorPositionEcefM: [rangeM, 0, 0],
    sensorVelocityEcefMps: [0, 0, 0],
    targetPositionEcefM: [0, 0, 0],
    slantRangeM: rangeM,
    rangeRateMps: -dopplerHz * system.wavelengthM / 2,
    twoWayDelaySeconds: 2 * rangeM / SPEED_OF_LIGHT_M_S,
    dopplerHz,
  });

  it("folds range and Doppler into the PRF ambiguity intervals", () => {
    const rangeM = system.unambiguousRangeM * 2.25;
    const samples = [sample(0, rangeM, 1400), sample(0.001, rangeM, -1600)];
    const result = analyzeSarAmbiguities({ samples, dopplerBandwidthHz: 3000 }, system);
    expect(result.samples[0].rangeAmbiguityOrder).toBe(2);
    expect(result.samples[0].apparentRangeM).toBeCloseTo(system.unambiguousRangeM * 0.25, 8);
    expect(result.samples[0].aliasedDopplerHz).toBeCloseTo(400, 12);
    expect(result.samples[1].aliasedDopplerHz).toBeCloseTo(400, 12);
    expect(result.azimuthAmbiguous).toBe(true);
    expect(result.estimatedAzimuthReplicaCount).toBe(3);
  });

  it("generates deterministic complex LFM samples with expected pulse support", () => {
    const rangeM = system.unambiguousRangeM * 0.25;
    const echo = generateSarPointTargetEcho(
      [sample(0, rangeM), sample(0.001, rangeM)],
      system,
      { targetRcsM2: 1, noiseStandardDeviation: 0, randomSeed: 7 },
    );
    expect(echo.pulseCount).toBe(2);
    expect(echo.fastTimeSampleCount).toBeGreaterThan(8);
    expect(echo.inPhase).toHaveLength(echo.pulseCount * echo.fastTimeSampleCount);
    expect(echo.peakMagnitude).toBeCloseTo(1, 5);
    const nonzero = Array.from(echo.inPhase.slice(0, echo.fastTimeSampleCount))
      .filter((value, index) => Math.hypot(value, echo.quadrature[index]) > 0.5).length;
    expect(nonzero).toBeGreaterThanOrEqual(Math.floor(system.pulseWidthSeconds * system.samplingRateHz));
    expect(echo.ambiguity.rangeAmbiguous).toBe(false);
  });
});

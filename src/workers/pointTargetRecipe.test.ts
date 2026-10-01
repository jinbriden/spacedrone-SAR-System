import { describe, expect, it } from "vitest";
import { defaultOrbit, defaultSar, type GroundTargetConfig, type SarConfig } from "../stores/simulationStore";
import { computeSarAnalysis } from "./sarAnalysis";
import { computeSarEcho } from "./sarEcho";
import { computeSarImaging } from "./sarImaging";

const target: GroundTargetConfig = {
  id: "point-target-cpa",
  name: "点目标-CPA",
  targetType: "point",
  longitudeDeg: 67.14,
  latitudeDeg: 0.70,
  altitudeM: 0,
  radiusM: 0,
  widthM: 0,
  heightM: 0,
  vertices: [],
};

const recipe: SarConfig = {
  ...defaultSar,
  targetId: target.id,
  analysisCenterSeconds: 10,
  carrierFrequencyHz: 9.65e9,
  chirpBandwidthHz: 80e6,
  pulseWidthSeconds: 20e-6,
  prfHz: 2500,
  samplingRateHz: 100e6,
  apertureDurationSeconds: 0.12,
  fastTimeMarginSeconds: 5e-6,
  echoPulseCount: 128,
  targetRcsM2: 1,
  noiseStandardDeviation: 0,
  randomSeed: 1,
  foldRangeAmbiguity: true,
  receiveChannelCount: 3,
  receiveChannelSpacingM: 1.5,
  multiChannelPulseCount: 64,
  dbfSteeringDopplerHz: 0,
  imagingAlgorithmId: "reference-range-backprojection",
  imagingMaximumRangePixels: 256,
};

describe("point-target imaging recipe", () => {
  it("keeps TX/RX timing valid and focuses a real-orbit point", () => {
    const scout = computeSarAnalysis({
      orbit: defaultOrbit,
      target,
      config: {
        ...recipe,
        prfHz: 200,
        apertureDurationSeconds: 20,
        analysisCenterSeconds: 20,
        echoPulseCount: 16,
      },
    });
    const scoutCpaSeconds = scout.history.closestApproach.slowTimeSeconds;
    const config = {
      ...recipe,
      analysisCenterSeconds: Math.max(recipe.apertureDurationSeconds / 2, scoutCpaSeconds),
    };
    const analysis = computeSarAnalysis({ orbit: defaultOrbit, target, config });
    const priSeconds = 1 / config.prfHz;
    const dutyCycle = config.pulseWidthSeconds * config.prfHz;
    const cpa = analysis.history.closestApproach;
    const foldedDelay = cpa.twoWayDelaySeconds - Math.floor(cpa.twoWayDelaySeconds / priSeconds) * priSeconds;
    const listenStart = foldedDelay - config.pulseWidthSeconds / 2 - config.fastTimeMarginSeconds;
    const listenEnd = foldedDelay + config.pulseWidthSeconds / 2 + config.fastTimeMarginSeconds;

    expect(analysis.startSeconds).toBeGreaterThanOrEqual(0);
    expect(dutyCycle).toBeLessThan(1);
    expect(config.samplingRateHz).toBeGreaterThanOrEqual(config.chirpBandwidthHz);
    expect(listenStart).toBeGreaterThan(0);
    expect(listenEnd).toBeLessThan(priSeconds);

    const echo = computeSarEcho({ orbit: defaultOrbit, target, config });
    expect(echo.echo.pulseCount).toBe(128);
    expect(echo.echo.inPhase.length).toBeLessThanOrEqual(5_000_000);

    const imaging = computeSarImaging({ orbit: defaultOrbit, target, config });
    expect(imaging.image.azimuthPixelCount).toBe(128);
    expect(imaging.image.intensityDb[
      imaging.image.peakAzimuthIndex * imaging.image.rangePixelCount + imaging.image.peakRangeIndex
    ]).toBeCloseTo(0, 5);
    expect(imaging.image.peakAzimuthIndex).toBe(64);
    expect(echo.echo.fastTimeSampleCount).toBeGreaterThan(1);
    expect(echo.echo.inPhase.length).toBe(echo.echo.fastTimeSampleCount * 128);
  }, 20_000);
});

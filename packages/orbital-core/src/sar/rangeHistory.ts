import { SPEED_OF_LIGHT_M_S } from "../constants";
import { dot, magnitude, subtract } from "../math/vector";
import type { Vector3 } from "../types";
import type { DerivedSarSystemParameters } from "./system";

export interface SarGeometrySample {
  slowTimeSeconds: number;
  sensorPositionEcefM: Vector3;
  sensorVelocityEcefMps: Vector3;
  targetPositionEcefM: Vector3;
  targetVelocityEcefMps?: Vector3;
}

export interface SarRangeHistorySample extends SarGeometrySample {
  slantRangeM: number;
  rangeRateMps: number;
  twoWayDelaySeconds: number;
  dopplerHz: number;
}

export interface SarRangeHistory {
  samples: SarRangeHistorySample[];
  closestApproach: SarRangeHistorySample;
  minimumRangeM: number;
  maximumRangeM: number;
  dopplerMinimumHz: number;
  dopplerMaximumHz: number;
  dopplerCentroidHz: number;
  meanDopplerHz: number;
  dopplerBandwidthHz: number;
  fastTimeStartSeconds: number;
  fastTimeEndSeconds: number;
  fastTimeSampleCount: number;
}

/** Computes monostatic two-way delay and Doppler from ECEF position/velocity samples. */
export function computeSarRangeHistory(
  samples: readonly SarGeometrySample[],
  system: DerivedSarSystemParameters,
): SarRangeHistory {
  if (samples.length < 2) throw new RangeError("SAR 斜距历程至少需要 2 个慢时间采样点。");
  let previousTime = -Infinity;
  const history = samples.map((sample) => {
    if (!Number.isFinite(sample.slowTimeSeconds) || sample.slowTimeSeconds <= previousTime) {
      throw new RangeError("SAR 慢时间必须严格递增。");
    }
    previousTime = sample.slowTimeSeconds;
    const relativePosition = subtract(sample.targetPositionEcefM, sample.sensorPositionEcefM);
    const relativeVelocity = subtract(sample.targetVelocityEcefMps ?? [0, 0, 0], sample.sensorVelocityEcefMps);
    const slantRangeM = magnitude(relativePosition);
    if (!Number.isFinite(slantRangeM) || slantRangeM <= 0) throw new RangeError("SAR 传感器与目标斜距必须大于 0。");
    const rangeRateMps = dot(relativePosition, relativeVelocity) / slantRangeM;
    return {
      ...sample,
      slantRangeM,
      rangeRateMps,
      twoWayDelaySeconds: 2 * slantRangeM / SPEED_OF_LIGHT_M_S,
      dopplerHz: -2 * rangeRateMps / system.wavelengthM,
    };
  });
  const closestApproach = history.reduce((closest, sample) => sample.slantRangeM < closest.slantRangeM ? sample : closest);
  const ranges = history.map((sample) => sample.slantRangeM);
  const dopplers = history.map((sample) => sample.dopplerHz);
  const minimumRangeM = Math.min(...ranges);
  const maximumRangeM = Math.max(...ranges);
  const dopplerMinimumHz = Math.min(...dopplers);
  const dopplerMaximumHz = Math.max(...dopplers);
  const fastTimeStartSeconds = Math.max(0, 2 * minimumRangeM / SPEED_OF_LIGHT_M_S - system.pulseWidthSeconds / 2 - system.fastTimeMarginSeconds);
  const fastTimeEndSeconds = 2 * maximumRangeM / SPEED_OF_LIGHT_M_S + system.pulseWidthSeconds / 2 + system.fastTimeMarginSeconds;
  const fastTimeSampleCount = Math.ceil((fastTimeEndSeconds - fastTimeStartSeconds) * system.samplingRateHz) + 1;
  if (fastTimeSampleCount > 2_000_000) {
    throw new RangeError("SAR 快时间窗采样点超过 2000000，请降低采样率、缩短孔径或减小余量。");
  }
  return {
    samples: history,
    closestApproach,
    minimumRangeM,
    maximumRangeM,
    dopplerMinimumHz,
    dopplerMaximumHz,
    dopplerCentroidHz: (dopplerMinimumHz + dopplerMaximumHz) / 2,
    meanDopplerHz: dopplers.reduce((sum, value) => sum + value, 0) / dopplers.length,
    dopplerBandwidthHz: dopplerMaximumHz - dopplerMinimumHz,
    fastTimeStartSeconds,
    fastTimeEndSeconds,
    fastTimeSampleCount,
  };
}

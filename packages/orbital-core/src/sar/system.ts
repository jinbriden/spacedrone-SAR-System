import { SPEED_OF_LIGHT_M_S } from "../constants";

export interface SarSystemParameters {
  carrierFrequencyHz: number;
  chirpBandwidthHz: number;
  pulseWidthSeconds: number;
  prfHz: number;
  samplingRateHz: number;
  apertureDurationSeconds: number;
  fastTimeMarginSeconds: number;
}

export interface DerivedSarSystemParameters extends SarSystemParameters {
  wavelengthM: number;
  rangeResolutionM: number;
  unambiguousRangeM: number;
  unambiguousRadialVelocityMps: number;
  dutyCycle: number;
  timeBandwidthProduct: number;
  slowTimeSampleCount: number;
}

/** Validates a pulsed monostatic LFM SAR configuration and derives its basic limits. */
export function deriveSarSystemParameters(parameters: SarSystemParameters): DerivedSarSystemParameters {
  const positive: Array<keyof SarSystemParameters> = [
    "carrierFrequencyHz", "chirpBandwidthHz", "pulseWidthSeconds", "prfHz",
    "samplingRateHz", "apertureDurationSeconds",
  ];
  for (const key of positive) {
    if (!Number.isFinite(parameters[key]) || parameters[key] <= 0) {
      throw new RangeError(`SAR 参数 ${key} 必须是正有限值。`);
    }
  }
  if (!Number.isFinite(parameters.fastTimeMarginSeconds) || parameters.fastTimeMarginSeconds < 0) {
    throw new RangeError("快时间窗余量必须是非负有限值。");
  }
  if (parameters.chirpBandwidthHz >= parameters.carrierFrequencyHz) {
    throw new RangeError("线性调频带宽必须小于载频。");
  }
  if (parameters.samplingRateHz < parameters.chirpBandwidthHz) {
    throw new RangeError("复基带采样率不得低于线性调频带宽。");
  }
  const dutyCycle = parameters.pulseWidthSeconds * parameters.prfHz;
  if (dutyCycle > 1) throw new RangeError("脉冲宽度与 PRF 的乘积不能超过 1。");
  const slowTimeSampleCount = Math.floor(parameters.apertureDurationSeconds * parameters.prfHz) + 1;
  if (slowTimeSampleCount > 200_000) {
    throw new RangeError("合成孔径慢时间采样点不能超过 200000，请缩短孔径时间或降低 PRF。");
  }
  const wavelengthM = SPEED_OF_LIGHT_M_S / parameters.carrierFrequencyHz;
  return {
    ...parameters,
    wavelengthM,
    rangeResolutionM: SPEED_OF_LIGHT_M_S / (2 * parameters.chirpBandwidthHz),
    unambiguousRangeM: SPEED_OF_LIGHT_M_S / (2 * parameters.prfHz),
    unambiguousRadialVelocityMps: wavelengthM * parameters.prfHz / 4,
    dutyCycle,
    timeBandwidthProduct: parameters.chirpBandwidthHz * parameters.pulseWidthSeconds,
    slowTimeSampleCount,
  };
}

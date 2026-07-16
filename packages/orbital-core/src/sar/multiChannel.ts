import { SPEED_OF_LIGHT_M_S } from "../constants";
import { add, magnitude, normalize, scale, subtract } from "../math/vector";
import type { Vector3 } from "../types";
import type { SarRangeHistorySample } from "./rangeHistory";
import type { DerivedSarSystemParameters } from "./system";

export interface SarMultiChannelEchoOptions {
  channelCount: number;
  alongTrackSpacingM: number;
  targetRcsM2: number;
  noiseStandardDeviation: number;
  randomSeed?: number;
  foldRangeAmbiguity?: boolean;
  maximumComplexSamples?: number;
}

export interface SarMultiChannelEcho {
  channelCount: number;
  channelOffsetsM: Float64Array;
  pulseCount: number;
  fastTimeSampleCount: number;
  fastTimeStartSeconds: number;
  fastTimeStepSeconds: number;
  slowTimeSeconds: Float64Array;
  inPhase: Float32Array;
  quadrature: Float32Array;
  referenceFastTimeIndex: number;
  meanPlatformSpeedMps: number;
  peakMagnitude: number;
  foldedRangeAmbiguity: boolean;
}

function createUniformNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

/** Generates center-transmit, along-track displaced receive-channel LFM echoes. */
export function generateSarMultiChannelEcho(
  samples: readonly SarRangeHistorySample[],
  system: DerivedSarSystemParameters,
  options: SarMultiChannelEchoOptions,
): SarMultiChannelEcho {
  if (samples.length < 2) throw new RangeError("多通道 SAR 回波至少需要 2 个脉冲。");
  if (!Number.isInteger(options.channelCount) || options.channelCount < 2 || options.channelCount > 32) throw new RangeError("SAR 接收通道数必须是 2～32 的整数。");
  if (!Number.isFinite(options.alongTrackSpacingM) || options.alongTrackSpacingM <= 0) throw new RangeError("SAR 通道沿轨间距必须大于 0 m。");
  if (!Number.isFinite(options.targetRcsM2) || options.targetRcsM2 <= 0) throw new RangeError("目标 RCS 必须大于 0 m²。");
  if (!Number.isFinite(options.noiseStandardDeviation) || options.noiseStandardDeviation < 0) throw new RangeError("复噪声标准差必须为非负值。");
  const channelOffsetsM = Float64Array.from({ length: options.channelCount }, (_, index) =>
    (index - (options.channelCount - 1) / 2) * options.alongTrackSpacingM,
  );
  const foldRangeAmbiguity = options.foldRangeAmbiguity ?? true;
  const priSeconds = 1 / system.prfHz;
  const delays = samples.map((sample) => {
    const alongTrack = normalize(sample.sensorVelocityEcefMps);
    return Array.from(channelOffsetsM, (offsetM) => {
      const receivePosition = add(sample.sensorPositionEcefM, scale(alongTrack, offsetM));
      const receiveRangeM = magnitude(subtract(sample.targetPositionEcefM, receivePosition));
      const absoluteDelay = (sample.slantRangeM + receiveRangeM) / SPEED_OF_LIGHT_M_S;
      return foldRangeAmbiguity ? absoluteDelay - Math.floor(absoluteDelay / priSeconds) * priSeconds : absoluteDelay;
    });
  });
  const allDelays = delays.flat();
  const halfPulse = system.pulseWidthSeconds / 2;
  const fastTimeStartSeconds = Math.max(0, Math.min(...allDelays) - halfPulse - system.fastTimeMarginSeconds);
  const fastTimeEndSeconds = Math.max(...allDelays) + halfPulse + system.fastTimeMarginSeconds;
  const fastTimeSampleCount = Math.ceil((fastTimeEndSeconds - fastTimeStartSeconds) * system.samplingRateHz) + 1;
  const complexSampleCount = options.channelCount * samples.length * fastTimeSampleCount;
  const maximumComplexSamples = options.maximumComplexSamples ?? 5_000_000;
  if (complexSampleCount > maximumComplexSamples) {
    throw new RangeError(`多通道回波包含 ${complexSampleCount} 个复采样点，超过上限 ${maximumComplexSamples}。`);
  }
  const inPhase = new Float32Array(complexSampleCount);
  const quadrature = new Float32Array(complexSampleCount);
  const chirpRate = system.chirpBandwidthHz / system.pulseWidthSeconds;
  const referenceRangeM = Math.min(...samples.map((sample) => sample.slantRangeM));
  const uniform = createUniformNoise(options.randomSeed ?? 1);
  let peakMagnitude = 0;
  for (let channelIndex = 0; channelIndex < options.channelCount; channelIndex += 1) {
    for (let pulseIndex = 0; pulseIndex < samples.length; pulseIndex += 1) {
      const sample = samples[pulseIndex];
      const alongTrack = normalize(sample.sensorVelocityEcefMps);
      const receivePosition = add(sample.sensorPositionEcefM, scale(alongTrack, channelOffsetsM[channelIndex]));
      const receiveRangeM = magnitude(subtract(sample.targetPositionEcefM, receivePosition));
      const pathLengthM = sample.slantRangeM + receiveRangeM;
      const amplitude = Math.sqrt(options.targetRcsM2) * referenceRangeM ** 2 / (sample.slantRangeM * receiveRangeM);
      const carrierPhase = -2 * Math.PI * pathLengthM / system.wavelengthM;
      const echoDelay = delays[pulseIndex][channelIndex];
      for (let fastIndex = 0; fastIndex < fastTimeSampleCount; fastIndex += 1) {
        const relativeFastTime = fastTimeStartSeconds + fastIndex / system.samplingRateHz - echoDelay;
        let i = 0;
        let q = 0;
        if (Math.abs(relativeFastTime) <= halfPulse) {
          const phase = Math.PI * chirpRate * relativeFastTime ** 2 + carrierPhase;
          i = amplitude * Math.cos(phase);
          q = amplitude * Math.sin(phase);
        }
        if (options.noiseStandardDeviation > 0) {
          const radius = Math.sqrt(-2 * Math.log(Math.max(1e-12, uniform()))) * options.noiseStandardDeviation;
          const angle = 2 * Math.PI * uniform();
          i += radius * Math.cos(angle);
          q += radius * Math.sin(angle);
        }
        const index = (channelIndex * samples.length + pulseIndex) * fastTimeSampleCount + fastIndex;
        inPhase[index] = i;
        quadrature[index] = q;
        peakMagnitude = Math.max(peakMagnitude, Math.hypot(i, q));
      }
    }
  }
  const centerDelay = delays[Math.floor(samples.length / 2)][Math.floor(options.channelCount / 2)];
  return {
    channelCount: options.channelCount,
    channelOffsetsM,
    pulseCount: samples.length,
    fastTimeSampleCount,
    fastTimeStartSeconds,
    fastTimeStepSeconds: 1 / system.samplingRateHz,
    slowTimeSeconds: Float64Array.from(samples.map((sample) => sample.slowTimeSeconds)),
    inPhase,
    quadrature,
    referenceFastTimeIndex: Math.max(0, Math.min(fastTimeSampleCount - 1, Math.round((centerDelay - fastTimeStartSeconds) * system.samplingRateHz))),
    meanPlatformSpeedMps: samples.reduce((sum, sample) => sum + magnitude(sample.sensorVelocityEcefMps), 0) / samples.length,
    peakMagnitude,
    foldedRangeAmbiguity: foldRangeAmbiguity,
  };
}

import type { SarRangeHistorySample } from "./rangeHistory";
import type { DerivedSarSystemParameters } from "./system";
import { analyzeSarAmbiguities, type SarAmbiguityAnalysis } from "./ambiguity";

export interface SarPointTargetEchoOptions {
  targetRcsM2: number;
  noiseStandardDeviation: number;
  randomSeed?: number;
  foldRangeAmbiguity?: boolean;
  maximumComplexSamples?: number;
}

export interface SarRawEcho {
  pulseCount: number;
  fastTimeSampleCount: number;
  fastTimeStartSeconds: number;
  fastTimeStepSeconds: number;
  slowTimeSeconds: Float64Array;
  inPhase: Float32Array;
  quadrature: Float32Array;
  peakMagnitude: number;
  meanPower: number;
  chirpRateHzPerSecond: number;
  referenceRangeM: number;
  referenceFastTimeIndex: number;
  ambiguity: SarAmbiguityAnalysis;
  foldedRangeAmbiguity: boolean;
}

function createUniformNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
}

/** Generates normalized monostatic point-target LFM complex baseband raw echo. */
export function generateSarPointTargetEcho(
  samples: readonly SarRangeHistorySample[],
  system: DerivedSarSystemParameters,
  options: SarPointTargetEchoOptions,
): SarRawEcho {
  if (samples.length < 2) throw new RangeError("SAR 回波至少需要 2 个连续脉冲。");
  if (!Number.isFinite(options.targetRcsM2) || options.targetRcsM2 <= 0) throw new RangeError("目标 RCS 必须大于 0 m²。");
  if (!Number.isFinite(options.noiseStandardDeviation) || options.noiseStandardDeviation < 0) throw new RangeError("复噪声标准差必须为非负值。");
  const ambiguity = analyzeSarAmbiguities({
    samples: [...samples],
    dopplerBandwidthHz: Math.max(...samples.map((sample) => sample.dopplerHz)) - Math.min(...samples.map((sample) => sample.dopplerHz)),
  }, system);
  const foldedRangeAmbiguity = options.foldRangeAmbiguity ?? true;
  const delays = foldedRangeAmbiguity
    ? ambiguity.samples.map((sample) => sample.foldedTwoWayDelaySeconds)
    : samples.map((sample) => sample.twoWayDelaySeconds);
  const halfPulse = system.pulseWidthSeconds / 2;
  const fastTimeStartSeconds = Math.max(0, Math.min(...delays) - halfPulse - system.fastTimeMarginSeconds);
  const fastTimeEndSeconds = Math.max(...delays) + halfPulse + system.fastTimeMarginSeconds;
  const fastTimeSampleCount = Math.ceil((fastTimeEndSeconds - fastTimeStartSeconds) * system.samplingRateHz) + 1;
  const complexSampleCount = fastTimeSampleCount * samples.length;
  const maximumComplexSamples = options.maximumComplexSamples ?? 5_000_000;
  if (complexSampleCount > maximumComplexSamples) {
    throw new RangeError(`SAR 回波包含 ${complexSampleCount} 个复采样点，超过上限 ${maximumComplexSamples}；请减少回波脉冲数、采样率、脉宽或余量。`);
  }
  const inPhase = new Float32Array(complexSampleCount);
  const quadrature = new Float32Array(complexSampleCount);
  const slowTimeSeconds = Float64Array.from(samples.map((sample) => sample.slowTimeSeconds));
  const referenceRangeM = Math.min(...samples.map((sample) => sample.slantRangeM));
  const chirpRateHzPerSecond = system.chirpBandwidthHz / system.pulseWidthSeconds;
  const uniform = createUniformNoise(options.randomSeed ?? 1);
  let peakMagnitude = 0;
  let powerSum = 0;
  for (let pulseIndex = 0; pulseIndex < samples.length; pulseIndex += 1) {
    const sample = samples[pulseIndex];
    const echoDelay = delays[pulseIndex];
    const amplitude = Math.sqrt(options.targetRcsM2) * (referenceRangeM / sample.slantRangeM) ** 2;
    const carrierPhase = -4 * Math.PI * sample.slantRangeM / system.wavelengthM;
    for (let fastIndex = 0; fastIndex < fastTimeSampleCount; fastIndex += 1) {
      const fastTime = fastTimeStartSeconds + fastIndex / system.samplingRateHz;
      const relativeFastTime = fastTime - echoDelay;
      let i = 0;
      let q = 0;
      if (Math.abs(relativeFastTime) <= halfPulse) {
        const phase = Math.PI * chirpRateHzPerSecond * relativeFastTime ** 2 + carrierPhase;
        i = amplitude * Math.cos(phase);
        q = amplitude * Math.sin(phase);
      }
      if (options.noiseStandardDeviation > 0) {
        const radius = Math.sqrt(-2 * Math.log(Math.max(1e-12, uniform()))) * options.noiseStandardDeviation;
        const angle = 2 * Math.PI * uniform();
        i += radius * Math.cos(angle);
        q += radius * Math.sin(angle);
      }
      const index = pulseIndex * fastTimeSampleCount + fastIndex;
      inPhase[index] = i;
      quadrature[index] = q;
      const magnitudeSquared = i * i + q * q;
      peakMagnitude = Math.max(peakMagnitude, Math.sqrt(magnitudeSquared));
      powerSum += magnitudeSquared;
    }
  }
  return {
    pulseCount: samples.length,
    fastTimeSampleCount,
    fastTimeStartSeconds,
    fastTimeStepSeconds: 1 / system.samplingRateHz,
    slowTimeSeconds,
    inPhase,
    quadrature,
    peakMagnitude,
    meanPower: powerSum / complexSampleCount,
    chirpRateHzPerSecond,
    referenceRangeM,
    referenceFastTimeIndex: Math.max(0, Math.min(
      fastTimeSampleCount - 1,
      Math.round((delays[Math.floor(samples.length / 2)] - fastTimeStartSeconds) * system.samplingRateHz),
    )),
    ambiguity,
    foldedRangeAmbiguity,
  };
}

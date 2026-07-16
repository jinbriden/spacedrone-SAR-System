import { SPEED_OF_LIGHT_M_S } from "../constants";
import { fftInPlace, nextPowerOfTwo } from "./fft";
import type { DerivedSarSystemParameters } from "./system";

export interface SarImagingInput {
  pulseCount: number;
  fastTimeSampleCount: number;
  fastTimeStartSeconds: number;
  fastTimeStepSeconds: number;
  referenceFastTimeIndex: number;
  inPhase: Float32Array;
  quadrature: Float32Array;
  slantRangeM: Float64Array;
  system: DerivedSarSystemParameters;
  maximumRangePixels?: number;
}

export interface SarFocusedImage {
  algorithmId: string;
  algorithmName: string;
  azimuthPixelCount: number;
  rangePixelCount: number;
  intensityDb: Float32Array;
  azimuthTimeOffsetSeconds: Float64Array;
  apparentRangeM: Float64Array;
  peakAzimuthIndex: number;
  peakRangeIndex: number;
  peakPower: number;
  azimuthPslrDb: number;
  rangePslrDb: number;
  azimuthResolutionSeconds: number;
  rangeResolutionM: number;
}

export interface SarImagingAlgorithm {
  id: string;
  name: string;
  description: string;
  focus(input: SarImagingInput): SarFocusedImage;
}

function pslrDb(values: readonly number[], peakIndex: number): number {
  const peak = values[peakIndex] ?? 0;
  let sidelobe = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (Math.abs(index - peakIndex) <= 1) continue;
    sidelobe = Math.max(sidelobe, values[index]);
  }
  return peak > 0 && sidelobe > 0 ? 10 * Math.log10(sidelobe / peak) : -Infinity;
}

function widthAboveHalfPower(values: readonly number[], peakIndex: number): number {
  const threshold = (values[peakIndex] ?? 0) / 2;
  let lower = peakIndex;
  let upper = peakIndex;
  while (lower > 0 && values[lower - 1] >= threshold) lower -= 1;
  while (upper + 1 < values.length && values[upper + 1] >= threshold) upper += 1;
  return upper - lower + 1;
}

export const referenceRangeBackprojectionAlgorithm: SarImagingAlgorithm = {
  id: "reference-range-backprojection",
  name: "参考距离压缩 / 斜距历程反投影",
  description: "FFT 距离匹配滤波，按真实斜距历程做最近邻 RCMC、双程相位补偿和慢时间相关。",
  focus(input) {
    const { pulseCount, fastTimeSampleCount } = input;
    if (!Number.isInteger(pulseCount) || pulseCount < 2 || pulseCount > 256) throw new RangeError("参考成像算法支持 2～256 个脉冲。");
    if (!Number.isInteger(fastTimeSampleCount) || fastTimeSampleCount < 2) throw new RangeError("成像快时间采样数必须至少为 2。");
    if (input.inPhase.length !== pulseCount * fastTimeSampleCount || input.quadrature.length !== input.inPhase.length) throw new RangeError("成像 I/Q 数组尺寸与脉冲/快时间维度不一致。");
    if (input.slantRangeM.length !== pulseCount) throw new RangeError("成像斜距历程长度必须等于脉冲数。");
    const chirpSampleCount = Math.max(2, Math.round(input.system.pulseWidthSeconds / input.fastTimeStepSeconds) + 1);
    const fftSize = nextPowerOfTwo(fastTimeSampleCount + chirpSampleCount - 1);
    if (fftSize > 131_072) throw new RangeError("参考距离压缩 FFT 长度超过 131072，请降低采样率、脉宽或快时间窗。");
    const filterReal = new Float64Array(fftSize);
    const filterImag = new Float64Array(fftSize);
    const chirpCenter = (chirpSampleCount - 1) / 2;
    const chirpRate = input.system.chirpBandwidthHz / input.system.pulseWidthSeconds;
    for (let index = 0; index < chirpSampleCount; index += 1) {
      const reversedTime = (chirpCenter - index) * input.fastTimeStepSeconds;
      const phase = -Math.PI * chirpRate * reversedTime ** 2;
      filterReal[index] = Math.cos(phase);
      filterImag[index] = Math.sin(phase);
    }
    fftInPlace(filterReal, filterImag);
    const compressedReal = new Float32Array(pulseCount * fastTimeSampleCount);
    const compressedImag = new Float32Array(compressedReal.length);
    const convolutionOffset = chirpSampleCount - 1 - Math.floor(chirpCenter);
    let globalPeakPower = 0;
    let globalPeakFastIndex = input.referenceFastTimeIndex;
    for (let pulse = 0; pulse < pulseCount; pulse += 1) {
      const real = new Float64Array(fftSize);
      const imag = new Float64Array(fftSize);
      const sourceOffset = pulse * fastTimeSampleCount;
      for (let index = 0; index < fastTimeSampleCount; index += 1) {
        real[index] = input.inPhase[sourceOffset + index];
        imag[index] = input.quadrature[sourceOffset + index];
      }
      fftInPlace(real, imag);
      for (let index = 0; index < fftSize; index += 1) {
        const rr = real[index] * filterReal[index] - imag[index] * filterImag[index];
        imag[index] = real[index] * filterImag[index] + imag[index] * filterReal[index];
        real[index] = rr;
      }
      fftInPlace(real, imag, true);
      for (let fast = 0; fast < fastTimeSampleCount; fast += 1) {
        const convolutionIndex = fast + convolutionOffset;
        const outputIndex = sourceOffset + fast;
        compressedReal[outputIndex] = real[convolutionIndex];
        compressedImag[outputIndex] = imag[convolutionIndex];
        const power = real[convolutionIndex] ** 2 + imag[convolutionIndex] ** 2;
        if (power > globalPeakPower) { globalPeakPower = power; globalPeakFastIndex = fast; }
      }
    }
    const rangePixelCount = Math.min(input.maximumRangePixels ?? 512, fastTimeSampleCount);
    const rangeStart = Math.max(0, Math.min(fastTimeSampleCount - rangePixelCount, globalPeakFastIndex - Math.floor(rangePixelCount / 2)));
    const centerAzimuth = Math.floor(pulseCount / 2);
    const centerRangeM = input.slantRangeM[centerAzimuth];
    const intensityPower = new Float64Array(pulseCount * rangePixelCount);
    let peakPower = 0;
    let peakAzimuthIndex = centerAzimuth;
    let peakRangeIndex = Math.max(0, Math.min(rangePixelCount - 1, globalPeakFastIndex - rangeStart));
    for (let azimuth = 0; azimuth < pulseCount; azimuth += 1) {
      const shift = azimuth - centerAzimuth;
      for (let rangePixel = 0; rangePixel < rangePixelCount; rangePixel += 1) {
        const baseFastIndex = rangeStart + rangePixel;
        let sumR = 0;
        let sumI = 0;
        let weightSum = 0;
        for (let pulse = 0; pulse < pulseCount; pulse += 1) {
          const referenceIndex = pulse - shift;
          if (referenceIndex < 0 || referenceIndex >= pulseCount) continue;
          const migrationSeconds = 2 * (input.slantRangeM[referenceIndex] - centerRangeM) / SPEED_OF_LIGHT_M_S;
          const migratedFastIndex = baseFastIndex + Math.round(migrationSeconds / input.fastTimeStepSeconds);
          if (migratedFastIndex < 0 || migratedFastIndex >= fastTimeSampleCount) continue;
          const index = pulse * fastTimeSampleCount + migratedFastIndex;
          const window = pulseCount === 2 ? 1 : 0.5 - 0.5 * Math.cos(2 * Math.PI * pulse / (pulseCount - 1));
          const phase = 4 * Math.PI * input.slantRangeM[referenceIndex] / input.system.wavelengthM;
          const c = Math.cos(phase);
          const s = Math.sin(phase);
          sumR += (compressedReal[index] * c - compressedImag[index] * s) * window;
          sumI += (compressedReal[index] * s + compressedImag[index] * c) * window;
          weightSum += window;
        }
        const power = weightSum > 0 ? (sumR * sumR + sumI * sumI) / (weightSum * weightSum) : 0;
        const outputIndex = azimuth * rangePixelCount + rangePixel;
        intensityPower[outputIndex] = power;
        if (power > peakPower) {
          peakPower = power;
          peakAzimuthIndex = azimuth;
          peakRangeIndex = rangePixel;
        }
      }
    }
    const intensityDb = Float32Array.from(intensityPower, (power) => Math.max(-80, 10 * Math.log10(Math.max(1e-30, power / Math.max(1e-30, peakPower)))));
    const azimuthCut = Array.from({ length: pulseCount }, (_, index) => intensityPower[index * rangePixelCount + peakRangeIndex]);
    const rangeCut = Array.from({ length: rangePixelCount }, (_, index) => intensityPower[peakAzimuthIndex * rangePixelCount + index]);
    const rangeSpacingM = SPEED_OF_LIGHT_M_S * input.fastTimeStepSeconds / 2;
    return {
      algorithmId: referenceRangeBackprojectionAlgorithm.id,
      algorithmName: referenceRangeBackprojectionAlgorithm.name,
      azimuthPixelCount: pulseCount,
      rangePixelCount,
      intensityDb,
      azimuthTimeOffsetSeconds: Float64Array.from({ length: pulseCount }, (_, index) => (index - centerAzimuth) / input.system.prfHz),
      apparentRangeM: Float64Array.from({ length: rangePixelCount }, (_, index) =>
        (input.fastTimeStartSeconds + (rangeStart + index) * input.fastTimeStepSeconds) * SPEED_OF_LIGHT_M_S / 2,
      ),
      peakAzimuthIndex,
      peakRangeIndex,
      peakPower,
      azimuthPslrDb: pslrDb(azimuthCut, peakAzimuthIndex),
      rangePslrDb: pslrDb(rangeCut, peakRangeIndex),
      azimuthResolutionSeconds: widthAboveHalfPower(azimuthCut, peakAzimuthIndex) / input.system.prfHz,
      rangeResolutionM: widthAboveHalfPower(rangeCut, peakRangeIndex) * rangeSpacingM,
    };
  },
};

export const SAR_IMAGING_ALGORITHMS: readonly SarImagingAlgorithm[] = [
  referenceRangeBackprojectionAlgorithm,
];

export function runSarImagingAlgorithm(algorithmId: string, input: SarImagingInput): SarFocusedImage {
  const algorithm = SAR_IMAGING_ALGORITHMS.find((candidate) => candidate.id === algorithmId);
  if (!algorithm) throw new RangeError(`未知 SAR 成像算法：${algorithmId}。`);
  return algorithm.focus(input);
}

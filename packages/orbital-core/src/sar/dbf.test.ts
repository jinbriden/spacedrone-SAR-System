import { describe, expect, it } from "vitest";
import { formSarDbfEcho, reconstructSarAzimuthSpectrum } from "./dbf";
import type { SarMultiChannelEcho } from "./multiChannel";

function syntheticEcho(frequencyHz: number, channelCount = 3, pulseCount = 32, prfHz = 100, speedMps = 100): SarMultiChannelEcho {
  const spacingM = 2 * speedMps / (channelCount * prfHz);
  const offsets = Float64Array.from({ length: channelCount }, (_, index) => (index - (channelCount - 1) / 2) * spacingM);
  const inPhase = new Float32Array(channelCount * pulseCount);
  const quadrature = new Float32Array(channelCount * pulseCount);
  for (let channel = 0; channel < channelCount; channel += 1) {
    for (let pulse = 0; pulse < pulseCount; pulse += 1) {
      const phase = 2 * Math.PI * frequencyHz * pulse / prfHz + Math.PI * frequencyHz * offsets[channel] / speedMps;
      const index = channel * pulseCount + pulse;
      inPhase[index] = Math.cos(phase);
      quadrature[index] = Math.sin(phase);
    }
  }
  return {
    channelCount, channelOffsetsM: offsets, pulseCount, fastTimeSampleCount: 1,
    fastTimeStartSeconds: 0, fastTimeStepSeconds: 1,
    slowTimeSeconds: Float64Array.from({ length: pulseCount }, (_, index) => index / prfHz),
    inPhase, quadrature, referenceFastTimeIndex: 0, meanPlatformSpeedMps: speedMps,
    peakMagnitude: 1, foldedRangeAmbiguity: true,
  };
}

describe("multi-channel DBF and azimuth spectrum reconstruction", () => {
  it("coherently steers channel phases to the requested Doppler", () => {
    const echo = syntheticEcho(25);
    const matched = formSarDbfEcho(echo, 25);
    const mismatched = formSarDbfEcho(echo, -25);
    expect(Math.hypot(matched.inPhase[0], matched.quadrature[0])).toBeCloseTo(1, 6);
    expect(Math.hypot(mismatched.inPhase[0], mismatched.quadrature[0])).toBeLessThan(0.8);
  });

  it("separates an aliased spectral component using critical channel spacing", () => {
    const echo = syntheticEcho(125);
    const spectrum = reconstructSarAzimuthSpectrum(echo, 100, 0, [-1, 0, 1]);
    const peakIndex = Array.from(spectrum.magnitude).reduce((best, value, index, values) => value > values[best] ? index : best, 0);
    expect(spectrum.frequencyHz[peakIndex]).toBeCloseTo(125, 6);
    expect(spectrum.minimumPivotMagnitude).toBeGreaterThan(0.1);
  });
});

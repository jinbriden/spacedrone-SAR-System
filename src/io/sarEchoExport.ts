import type { SarEchoResult } from "../workers/sarEcho";
import { createMatFileV5, matV5ComplexSingle, matV5Double, matV5String } from "./matFileV5";

/** SPDRIQ1: 8-byte magic, uint32 LE JSON length, UTF-8 JSON, 4-byte padding, then interleaved float32 LE I/Q. */
export function sarEchoToBinary(result: SarEchoResult): ArrayBuffer {
  const metadata = {
    format: "SPDRIQ1",
    dataType: "float32-le-interleaved-iq",
    order: "pulse-major-fast-time-minor",
    targetId: result.targetId,
    targetName: result.targetName,
    pulseCount: result.echo.pulseCount,
    fastTimeSampleCount: result.echo.fastTimeSampleCount,
    fastTimeStartSeconds: result.echo.fastTimeStartSeconds,
    fastTimeStepSeconds: result.echo.fastTimeStepSeconds,
    selectedPulseStartSeconds: result.selectedPulseStartSeconds,
    selectedPulseEndSeconds: result.selectedPulseEndSeconds,
    carrierFrequencyHz: result.system.carrierFrequencyHz,
    chirpBandwidthHz: result.system.chirpBandwidthHz,
    pulseWidthSeconds: result.system.pulseWidthSeconds,
    prfHz: result.system.prfHz,
    samplingRateHz: result.system.samplingRateHz,
    foldedRangeAmbiguity: result.echo.foldedRangeAmbiguity,
    maximumRangeAmbiguityOrder: result.echo.ambiguity.maximumRangeAmbiguityOrder,
    maximumAzimuthAmbiguityOrder: result.echo.ambiguity.maximumAzimuthAmbiguityOrder,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const headerEnd = 12 + encoded.length;
  const dataOffset = Math.ceil(headerEnd / 4) * 4;
  const complexCount = result.echo.inPhase.length;
  const buffer = new ArrayBuffer(dataOffset + complexCount * 2 * 4);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("SPDRIQ1\0"), 0);
  new DataView(buffer).setUint32(8, encoded.length, true);
  bytes.set(encoded, 12);
  const iq = new Float32Array(buffer, dataOffset, complexCount * 2);
  for (let index = 0; index < complexCount; index += 1) {
    iq[index * 2] = result.echo.inPhase[index];
    iq[index * 2 + 1] = result.echo.quadrature[index];
  }
  return buffer;
}

/** MATLAB Level-5 file with a complex single fast-time-by-pulse echo matrix and engineering metadata. */
export function sarEchoToMatFile(result: SarEchoResult): ArrayBuffer {
  const echo = result.echo;
  const fastTimeSeconds = Float64Array.from({ length: echo.fastTimeSampleCount }, (_, index) =>
    echo.fastTimeStartSeconds + index * echo.fastTimeStepSeconds,
  );
  const scalar = (name: string, value: number) => matV5Double(name, 1, 1, [value]);
  return createMatFileV5([
    matV5ComplexSingle("echo_iq", echo.fastTimeSampleCount, echo.pulseCount, echo.inPhase, echo.quadrature),
    matV5Double("fast_time_s", echo.fastTimeSampleCount, 1, fastTimeSeconds),
    matV5Double("slow_time_s", echo.pulseCount, 1, echo.slowTimeSeconds),
    matV5Double("slant_range_m", echo.pulseCount, 1, result.selectedSlantRangeM),
    scalar("carrier_frequency_hz", result.system.carrierFrequencyHz),
    scalar("wavelength_m", result.system.wavelengthM),
    scalar("chirp_bandwidth_hz", result.system.chirpBandwidthHz),
    scalar("pulse_width_s", result.system.pulseWidthSeconds),
    scalar("chirp_rate_hz_per_s", echo.chirpRateHzPerSecond),
    scalar("prf_hz", result.system.prfHz),
    scalar("sampling_rate_hz", result.system.samplingRateHz),
    scalar("fast_time_start_s", echo.fastTimeStartSeconds),
    scalar("fast_time_step_s", echo.fastTimeStepSeconds),
    scalar("selected_pulse_start_s", result.selectedPulseStartSeconds),
    scalar("selected_pulse_end_s", result.selectedPulseEndSeconds),
    scalar("reference_range_m", echo.referenceRangeM),
    scalar("reference_fast_time_index", echo.referenceFastTimeIndex + 1),
    scalar("folded_range_ambiguity", echo.foldedRangeAmbiguity ? 1 : 0),
    matV5String("target_id", result.targetId),
    matV5String("target_name", result.targetName),
  ], "complex baseband point-target echo");
}

import type { SarEchoResult } from "../workers/sarEcho";

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

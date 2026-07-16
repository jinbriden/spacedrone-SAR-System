import type { SarDbfAnalysisResult } from "../workers/sarDbf";

export function sarSpectrumToCsv(result: SarDbfAnalysisResult): string {
  const rows = Array.from(result.spectrum.frequencyHz, (frequencyHz, index) =>
    `${frequencyHz},${result.spectrum.magnitude[index]}`,
  );
  return `\uFEFFfrequencyHz,magnitude\r\n${rows.join("\r\n")}\r\n`;
}

/** SPDRDB1 stores channel-major raw I/Q followed by pulse-major DBF I/Q. */
export function sarDbfToBinary(result: SarDbfAnalysisResult): ArrayBuffer {
  const echo = result.multiChannelEcho;
  const metadata = {
    format: "SPDRDB1",
    dataType: "float32-le-interleaved-iq",
    rawOrder: "channel-major-pulse-major-fast-time-minor",
    dbfOrder: "pulse-major-fast-time-minor",
    targetId: result.targetId,
    targetName: result.targetName,
    channelCount: echo.channelCount,
    channelOffsetsM: Array.from(echo.channelOffsetsM),
    pulseCount: echo.pulseCount,
    fastTimeSampleCount: echo.fastTimeSampleCount,
    fastTimeStartSeconds: echo.fastTimeStartSeconds,
    fastTimeStepSeconds: echo.fastTimeStepSeconds,
    rawComplexCount: echo.inPhase.length,
    dbfComplexCount: result.dbf.inPhase.length,
    dbfSteeringDopplerHz: result.dbf.steeringDopplerHz,
    dbfWeightReal: Array.from(result.dbf.weightReal),
    dbfWeightImag: Array.from(result.dbf.weightImag),
  };
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const dataOffset = Math.ceil((12 + encoded.length) / 4) * 4;
  const totalComplex = echo.inPhase.length + result.dbf.inPhase.length;
  const buffer = new ArrayBuffer(dataOffset + totalComplex * 2 * 4);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("SPDRDB1\0"), 0);
  new DataView(buffer).setUint32(8, encoded.length, true);
  bytes.set(encoded, 12);
  const output = new Float32Array(buffer, dataOffset);
  let cursor = 0;
  for (let index = 0; index < echo.inPhase.length; index += 1) {
    output[cursor++] = echo.inPhase[index];
    output[cursor++] = echo.quadrature[index];
  }
  for (let index = 0; index < result.dbf.inPhase.length; index += 1) {
    output[cursor++] = result.dbf.inPhase[index];
    output[cursor++] = result.dbf.quadrature[index];
  }
  return buffer;
}

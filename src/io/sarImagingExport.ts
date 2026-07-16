import type { SarImagingResult } from "../workers/sarImaging";

/** SPDRIMG1: JSON metadata followed by row-major float32 normalized dB pixels. */
export function sarImageToBinary(result: SarImagingResult): ArrayBuffer {
  const image = result.image;
  const metadata = {
    format: "SPDRIMG1",
    dataType: "float32-le",
    order: "azimuth-major-range-minor",
    targetId: result.targetId,
    targetName: result.targetName,
    algorithmId: image.algorithmId,
    algorithmName: image.algorithmName,
    azimuthPixelCount: image.azimuthPixelCount,
    rangePixelCount: image.rangePixelCount,
    azimuthTimeOffsetSeconds: Array.from(image.azimuthTimeOffsetSeconds),
    apparentRangeM: Array.from(image.apparentRangeM),
    peakAzimuthIndex: image.peakAzimuthIndex,
    peakRangeIndex: image.peakRangeIndex,
    azimuthPslrDb: image.azimuthPslrDb,
    rangePslrDb: image.rangePslrDb,
    azimuthResolutionSeconds: image.azimuthResolutionSeconds,
    rangeResolutionM: image.rangeResolutionM,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const dataOffset = Math.ceil((12 + encoded.length) / 4) * 4;
  const buffer = new ArrayBuffer(dataOffset + image.intensityDb.length * 4);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode("SPDRIMG1"), 0);
  new DataView(buffer).setUint32(8, encoded.length, true);
  bytes.set(encoded, 12);
  new Float32Array(buffer, dataOffset).set(image.intensityDb);
  return buffer;
}

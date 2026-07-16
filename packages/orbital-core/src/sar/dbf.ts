import type { SarMultiChannelEcho } from "./multiChannel";

export interface SarDbfResult {
  steeringDopplerHz: number;
  weightReal: Float64Array;
  weightImag: Float64Array;
  inPhase: Float32Array;
  quadrature: Float32Array;
  peakMagnitude: number;
}

export interface SarReconstructedSpectrum {
  fastTimeIndex: number;
  aliasOrders: number[];
  frequencyHz: Float64Array;
  magnitude: Float64Array;
  minimumPivotMagnitude: number;
}

/** Coherently combines along-track receive channels for a requested monostatic Doppler. */
export function formSarDbfEcho(echo: SarMultiChannelEcho, steeringDopplerHz: number): SarDbfResult {
  if (!Number.isFinite(steeringDopplerHz)) throw new RangeError("DBF 指向多普勒必须是有限值。");
  const weightReal = new Float64Array(echo.channelCount);
  const weightImag = new Float64Array(echo.channelCount);
  for (let channel = 0; channel < echo.channelCount; channel += 1) {
    const phase = -Math.PI * steeringDopplerHz * echo.channelOffsetsM[channel] / echo.meanPlatformSpeedMps;
    weightReal[channel] = Math.cos(phase) / echo.channelCount;
    weightImag[channel] = Math.sin(phase) / echo.channelCount;
  }
  const outputCount = echo.pulseCount * echo.fastTimeSampleCount;
  const inPhase = new Float32Array(outputCount);
  const quadrature = new Float32Array(outputCount);
  let peakMagnitude = 0;
  for (let channel = 0; channel < echo.channelCount; channel += 1) {
    const wr = weightReal[channel];
    const wi = weightImag[channel];
    const channelOffset = channel * outputCount;
    for (let index = 0; index < outputCount; index += 1) {
      const xr = echo.inPhase[channelOffset + index];
      const xi = echo.quadrature[channelOffset + index];
      inPhase[index] += xr * wr - xi * wi;
      quadrature[index] += xr * wi + xi * wr;
    }
  }
  for (let index = 0; index < outputCount; index += 1) peakMagnitude = Math.max(peakMagnitude, Math.hypot(inPhase[index], quadrature[index]));
  return { steeringDopplerHz, weightReal, weightImag, inPhase, quadrature, peakMagnitude };
}

interface Complex { r: number; i: number }
const multiply = (a: Complex, b: Complex): Complex => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r });
const subtract = (a: Complex, b: Complex): Complex => ({ r: a.r - b.r, i: a.i - b.i });
const divide = (a: Complex, b: Complex): Complex => {
  const denominator = b.r * b.r + b.i * b.i;
  return { r: (a.r * b.r + a.i * b.i) / denominator, i: (a.i * b.r - a.r * b.i) / denominator };
};

function solveComplex(matrix: Complex[][], vector: Complex[]): { solution: Complex[]; minimumPivotMagnitude: number } {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row.map((value) => ({ ...value })), { ...vector[index] }]);
  let minimumPivotMagnitude = Infinity;
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.hypot(augmented[row][column].r, augmented[row][column].i) > Math.hypot(augmented[pivot][column].r, augmented[pivot][column].i)) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    const pivotMagnitude = Math.hypot(pivotValue.r, pivotValue.i);
    minimumPivotMagnitude = Math.min(minimumPivotMagnitude, pivotMagnitude);
    if (pivotMagnitude < 1e-10) throw new RangeError("多通道频谱重构矩阵奇异；请调整通道间距、PRF 或模糊阶数。");
    for (let item = column; item <= n; item += 1) augmented[column][item] = divide(augmented[column][item], pivotValue);
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= n; item += 1) augmented[row][item] = subtract(augmented[row][item], multiply(factor, augmented[column][item]));
    }
  }
  return { solution: augmented.map((row) => row[n]), minimumPivotMagnitude };
}

/** Reconstructs aliased azimuth spectral replicas at one range cell using the channel phase matrix. */
export function reconstructSarAzimuthSpectrum(
  echo: SarMultiChannelEcho,
  prfHz: number,
  fastTimeIndex = echo.referenceFastTimeIndex,
  aliasOrders?: readonly number[],
): SarReconstructedSpectrum {
  if (!Number.isFinite(prfHz) || prfHz <= 0) throw new RangeError("频谱重构 PRF 必须大于 0。");
  if (!Number.isInteger(fastTimeIndex) || fastTimeIndex < 0 || fastTimeIndex >= echo.fastTimeSampleCount) throw new RangeError("频谱重构快时间索引越界。");
  if (echo.pulseCount > 512) throw new RangeError("浏览器参考频谱重构最多处理 512 个脉冲。");
  const orders = aliasOrders ? [...aliasOrders] : Array.from({ length: echo.channelCount }, (_, index) => index - Math.floor(echo.channelCount / 2));
  if (orders.length !== echo.channelCount || new Set(orders).size !== orders.length) throw new RangeError("模糊阶数数量必须等于通道数且互不重复。");
  const n = echo.pulseCount;
  const channelSpectra = Array.from({ length: echo.channelCount }, () => Array.from({ length: n }, () => ({ r: 0, i: 0 })));
  for (let channel = 0; channel < echo.channelCount; channel += 1) {
    for (let bin = 0; bin < n; bin += 1) {
      const centeredBin = bin - Math.floor(n / 2);
      let sumR = 0;
      let sumI = 0;
      for (let pulse = 0; pulse < n; pulse += 1) {
        const window = n === 2 ? 1 : 0.5 - 0.5 * Math.cos(2 * Math.PI * pulse / (n - 1));
        const index = (channel * n + pulse) * echo.fastTimeSampleCount + fastTimeIndex;
        const phase = -2 * Math.PI * centeredBin * pulse / n;
        const c = Math.cos(phase);
        const s = Math.sin(phase);
        const xr = echo.inPhase[index] * window;
        const xi = echo.quadrature[index] * window;
        sumR += xr * c - xi * s;
        sumI += xr * s + xi * c;
      }
      channelSpectra[channel][bin] = { r: sumR, i: sumI };
    }
  }
  const records: Array<{ frequencyHz: number; magnitude: number }> = [];
  let minimumPivotMagnitude = Infinity;
  for (let bin = 0; bin < n; bin += 1) {
    const basebandFrequencyHz = (bin - Math.floor(n / 2)) * prfHz / n;
    const matrix = Array.from({ length: echo.channelCount }, (_, channel) =>
      orders.map((order) => {
        const frequencyHz = basebandFrequencyHz + order * prfHz;
        const phase = Math.PI * frequencyHz * echo.channelOffsetsM[channel] / echo.meanPlatformSpeedMps;
        return { r: Math.cos(phase), i: Math.sin(phase) };
      }),
    );
    const solved = solveComplex(matrix, channelSpectra.map((spectrum) => spectrum[bin]));
    minimumPivotMagnitude = Math.min(minimumPivotMagnitude, solved.minimumPivotMagnitude);
    solved.solution.forEach((value, index) => records.push({
      frequencyHz: basebandFrequencyHz + orders[index] * prfHz,
      magnitude: Math.hypot(value.r, value.i),
    }));
  }
  records.sort((left, right) => left.frequencyHz - right.frequencyHz);
  return {
    fastTimeIndex,
    aliasOrders: orders,
    frequencyHz: Float64Array.from(records.map((record) => record.frequencyHz)),
    magnitude: Float64Array.from(records.map((record) => record.magnitude)),
    minimumPivotMagnitude,
  };
}

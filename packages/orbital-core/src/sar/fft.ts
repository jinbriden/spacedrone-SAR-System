export function nextPowerOfTwo(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError("FFT 长度基数必须是正整数。");
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

/** In-place radix-2 complex FFT. Inverse transform includes 1/N scaling. */
export function fftInPlace(real: Float64Array, imag: Float64Array, inverse = false): void {
  const n = real.length;
  if (imag.length !== n || n < 1 || (n & (n - 1)) !== 0) throw new RangeError("FFT 实部/虚部长度必须相同且为 2 的幂。");
  for (let index = 1, reversed = 0; index < n; index += 1) {
    let bit = n >> 1;
    while (reversed & bit) { reversed ^= bit; bit >>= 1; }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imag[index], imag[reversed]] = [imag[reversed], imag[index]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / length;
    const stepR = Math.cos(angle);
    const stepI = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let wr = 1;
      let wi = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const tr = wr * real[odd] - wi * imag[odd];
        const ti = wr * imag[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imag[odd] = imag[even] - ti;
        real[even] += tr;
        imag[even] += ti;
        const nextWr = wr * stepR - wi * stepI;
        wi = wr * stepI + wi * stepR;
        wr = nextWr;
      }
    }
  }
  if (inverse) {
    for (let index = 0; index < n; index += 1) {
      real[index] /= n;
      imag[index] /= n;
    }
  }
}

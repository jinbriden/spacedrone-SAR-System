export function normalizeLongitudeRad(longitudeRad: number): number {
  return ((longitudeRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/** Unwraps ordered longitudes so adjacent values differ by no more than pi. */
export function unwrapLongitudesRad(longitudesRad: readonly number[]): number[] {
  if (longitudesRad.length === 0) return [];
  const result = [normalizeLongitudeRad(longitudesRad[0])];
  for (let index = 1; index < longitudesRad.length; index += 1) {
    let candidate = normalizeLongitudeRad(longitudesRad[index]);
    const previous = result[index - 1];
    while (candidate - previous > Math.PI) candidate -= 2 * Math.PI;
    while (candidate - previous < -Math.PI) candidate += 2 * Math.PI;
    result.push(candidate);
  }
  return result;
}

export function crossesAntimeridian(longitudesRad: readonly number[]): boolean {
  if (longitudesRad.length < 2) return false;
  const normalized = longitudesRad.map(normalizeLongitudeRad);
  return Math.max(...normalized) - Math.min(...normalized) > Math.PI;
}

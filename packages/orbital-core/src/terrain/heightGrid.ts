export interface TerrainHeightGrid {
  name: string;
  longitudeDeg: number[];
  latitudeDeg: number[];
  heightM: number[][];
}

export function validateTerrainHeightGrid(grid: TerrainHeightGrid): void {
  if (!grid.name.trim()) throw new RangeError("DEM 名称不能为空。");
  if (grid.longitudeDeg.length < 2 || grid.latitudeDeg.length < 2) throw new RangeError("DEM 经纬度轴均至少需要 2 个采样点。");
  if (grid.longitudeDeg.length * grid.latitudeDeg.length > 250_000) throw new RangeError("DEM 网格最多支持 250000 个高程点。");
  const validateAxis = (axis: readonly number[], label: string, minimum: number, maximum: number) => {
    axis.forEach((value, index) => {
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label}[${index}] 超出 ${minimum}～${maximum} deg。`);
      if (index > 0 && value <= axis[index - 1]) throw new RangeError(`${label} 必须严格递增。`);
    });
  };
  validateAxis(grid.longitudeDeg, "DEM longitudeDeg", -360, 360);
  validateAxis(grid.latitudeDeg, "DEM latitudeDeg", -90, 90);
  if (grid.longitudeDeg.at(-1)! - grid.longitudeDeg[0] > 360) throw new RangeError("DEM 经度跨度不能超过 360 deg。");
  if (grid.heightM.length !== grid.latitudeDeg.length) throw new RangeError("DEM heightM 行数必须等于纬度轴长度。");
  grid.heightM.forEach((row, latitudeIndex) => {
    if (row.length !== grid.longitudeDeg.length) throw new RangeError(`DEM heightM[${latitudeIndex}] 列数必须等于经度轴长度。`);
    row.forEach((height, longitudeIndex) => {
      if (!Number.isFinite(height) || height < -12_000 || height > 100_000) throw new RangeError(`DEM heightM[${latitudeIndex}][${longitudeIndex}] 必须位于 -12000～100000 m。`);
    });
  });
}

function interval(axis: readonly number[], value: number): { index: number; fraction: number } | undefined {
  if (value < axis[0] || value > axis[axis.length - 1]) return undefined;
  if (value === axis[axis.length - 1]) return { index: axis.length - 2, fraction: 1 };
  let lower = 0;
  let upper = axis.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (axis[middle] <= value) lower = middle;
    else upper = middle;
  }
  return { index: lower, fraction: (value - axis[lower]) / (axis[lower + 1] - axis[lower]) };
}

function longitudeInGrid(longitudeDeg: number, axis: readonly number[]): number | undefined {
  for (const candidate of [longitudeDeg, longitudeDeg + 360, longitudeDeg - 360]) {
    if (candidate >= axis[0] && candidate <= axis[axis.length - 1]) return candidate;
  }
  return undefined;
}

/** Bilinear DEM height interpolation. Returns undefined outside the imported grid. */
export function interpolateTerrainHeightM(grid: TerrainHeightGrid, longitudeDeg: number, latitudeDeg: number): number | undefined {
  const longitude = longitudeInGrid(longitudeDeg, grid.longitudeDeg);
  if (longitude === undefined) return undefined;
  const longitudeCell = interval(grid.longitudeDeg, longitude);
  const latitudeCell = interval(grid.latitudeDeg, latitudeDeg);
  if (!longitudeCell || !latitudeCell) return undefined;
  const x = longitudeCell.fraction;
  const y = latitudeCell.fraction;
  const row0 = grid.heightM[latitudeCell.index];
  const row1 = grid.heightM[latitudeCell.index + 1];
  const lower = row0[longitudeCell.index] * (1 - x) + row0[longitudeCell.index + 1] * x;
  const upper = row1[longitudeCell.index] * (1 - x) + row1[longitudeCell.index + 1] * x;
  return lower * (1 - y) + upper * y;
}

export function terrainHeightRangeM(grid: TerrainHeightGrid): { minimumM: number; maximumM: number } {
  const values = grid.heightM.flat();
  return { minimumM: Math.min(...values), maximumM: Math.max(...values) };
}

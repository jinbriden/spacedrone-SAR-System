import { validateTerrainHeightGrid, type TerrainHeightGrid } from "@spacedrone/orbital-core";
import { parseCsvRows } from "./targetImport";

function finite(value: unknown, path: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${path} 必须是有限数值。`);
  return number;
}

export function parseTerrainHeightGridValue(value: unknown): TerrainHeightGrid {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("DEM JSON 根值必须是对象。");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.longitudeDeg) || !Array.isArray(raw.latitudeDeg) || !Array.isArray(raw.heightM)) throw new Error("DEM JSON 必须包含 longitudeDeg、latitudeDeg 和 heightM 数组。");
  const grid: TerrainHeightGrid = {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "导入 DEM",
    longitudeDeg: raw.longitudeDeg.map((item, index) => finite(item, `longitudeDeg[${index}]`)),
    latitudeDeg: raw.latitudeDeg.map((item, index) => finite(item, `latitudeDeg[${index}]`)),
    heightM: raw.heightM.map((row, latitudeIndex) => {
      if (!Array.isArray(row)) throw new Error(`heightM[${latitudeIndex}] 必须是数组。`);
      return row.map((item, longitudeIndex) => finite(item, `heightM[${latitudeIndex}][${longitudeIndex}]`));
    }),
  };
  validateTerrainHeightGrid(grid);
  return grid;
}

export function parseTerrainJson(text: string): TerrainHeightGrid {
  try { return parseTerrainHeightGridValue(JSON.parse(text.replace(/^\uFEFF/, ""))); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("DEM 文件不是有效 JSON。"); throw error; }
}

export function parseTerrainCsv(text: string): TerrainHeightGrid {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("DEM CSV 至少需要表头和 4 个网格点。");
  const headers = rows[0].map((header) => header.trim());
  for (const field of ["longitudeDeg", "latitudeDeg", "heightM"]) if (!headers.includes(field)) throw new Error(`DEM CSV 缺少字段 ${field}。`);
  const longitudeIndex = headers.indexOf("longitudeDeg");
  const latitudeIndex = headers.indexOf("latitudeDeg");
  const heightIndex = headers.indexOf("heightM");
  const samples = rows.slice(1).map((row, index) => ({
    longitudeDeg: finite(row[longitudeIndex], `第 ${index + 2} 行 longitudeDeg`),
    latitudeDeg: finite(row[latitudeIndex], `第 ${index + 2} 行 latitudeDeg`),
    heightM: finite(row[heightIndex], `第 ${index + 2} 行 heightM`),
  }));
  const longitudeDeg = [...new Set(samples.map((sample) => sample.longitudeDeg))].sort((a, b) => a - b);
  const latitudeDeg = [...new Set(samples.map((sample) => sample.latitudeDeg))].sort((a, b) => a - b);
  const values = new Map<string, number>();
  for (const sample of samples) {
    const key = `${sample.longitudeDeg}\u0000${sample.latitudeDeg}`;
    if (values.has(key)) throw new Error(`DEM CSV 含重复网格点 lon=${sample.longitudeDeg}, lat=${sample.latitudeDeg}。`);
    values.set(key, sample.heightM);
  }
  const heightM = latitudeDeg.map((latitude) => longitudeDeg.map((longitude) => {
    const height = values.get(`${longitude}\u0000${latitude}`);
    if (height === undefined) throw new Error(`DEM CSV 缺少网格点 lon=${longitude}, lat=${latitude}。`);
    return height;
  }));
  return parseTerrainHeightGridValue({ name: "导入 CSV DEM", longitudeDeg, latitudeDeg, heightM });
}

export function parseTerrainFile(text: string, fileName: string): TerrainHeightGrid {
  return fileName.toLowerCase().endsWith(".json") ? parseTerrainJson(text) : parseTerrainCsv(text);
}

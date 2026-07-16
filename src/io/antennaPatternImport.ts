import type { AntennaGainPattern } from "@spacedrone/orbital-core";
import { parseCsvRows } from "./targetImport";

function finite(value: unknown, path: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${path} 必须是有限数值。`);
  return number;
}

function validateAxis(value: unknown, path: string): number[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${path} 至少需要 2 个角度。`);
  if (value.length > 201) throw new Error(`${path} 最多支持 201 个角度。`);
  const axis = value.map((item, index) => finite(item, `${path}[${index}]`));
  for (let index = 0; index < axis.length; index += 1) {
    if (axis[index] < -89 || axis[index] > 89) throw new Error(`${path}[${index}] 必须位于 -89～89 deg。`);
    if (index > 0 && axis[index] <= axis[index - 1]) throw new Error(`${path} 必须严格递增。`);
  }
  return axis;
}

export function parseAntennaPatternValue(value: unknown): AntennaGainPattern {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("方向图 JSON 根值必须是对象。");
  const raw = value as Record<string, unknown>;
  const azimuthAnglesDeg = validateAxis(raw.azimuthAnglesDeg, "azimuthAnglesDeg");
  const elevationAnglesDeg = validateAxis(raw.elevationAnglesDeg, "elevationAnglesDeg");
  if (azimuthAnglesDeg.length * elevationAnglesDeg.length > 40_000) throw new Error("方向图网格最多支持 40000 个增益点。");
  if (!Array.isArray(raw.gainDb) || raw.gainDb.length !== elevationAnglesDeg.length) {
    throw new Error("gainDb 行数必须与 elevationAnglesDeg 长度一致。");
  }
  const gainDb = raw.gainDb.map((rawRow, elevationIndex) => {
    if (!Array.isArray(rawRow) || rawRow.length !== azimuthAnglesDeg.length) {
      throw new Error(`gainDb[${elevationIndex}] 列数必须与 azimuthAnglesDeg 长度一致。`);
    }
    return rawRow.map((gain, azimuthIndex) => finite(gain, `gainDb[${elevationIndex}][${azimuthIndex}]`));
  });
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "导入二维方向图";
  return { name, azimuthAnglesDeg, elevationAnglesDeg, gainDb };
}

export function parseAntennaPatternJson(text: string): AntennaGainPattern {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("方向图文件不是有效 JSON。");
  }
  return parseAntennaPatternValue(value);
}

export function parseAntennaPatternCsv(text: string): AntennaGainPattern {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 5) throw new Error("方向图 CSV 至少需要表头和 4 个网格点。" );
  const headers = rows[0].map((header) => header.trim());
  for (const field of ["azimuthDeg", "elevationDeg", "gainDb"]) {
    if (!headers.includes(field)) throw new Error(`方向图 CSV 缺少字段 ${field}。`);
  }
  const azimuthIndex = headers.indexOf("azimuthDeg");
  const elevationIndex = headers.indexOf("elevationDeg");
  const gainIndex = headers.indexOf("gainDb");
  const samples = rows.slice(1).map((row, index) => ({
    azimuthDeg: finite(row[azimuthIndex], `第 ${index + 2} 行 azimuthDeg`),
    elevationDeg: finite(row[elevationIndex], `第 ${index + 2} 行 elevationDeg`),
    gainDb: finite(row[gainIndex], `第 ${index + 2} 行 gainDb`),
  }));
  const azimuthAnglesDeg = [...new Set(samples.map((sample) => sample.azimuthDeg))].sort((a, b) => a - b);
  const elevationAnglesDeg = [...new Set(samples.map((sample) => sample.elevationDeg))].sort((a, b) => a - b);
  const values = new Map<string, number>();
  for (const sample of samples) {
    const key = `${sample.azimuthDeg}\u0000${sample.elevationDeg}`;
    if (values.has(key)) throw new Error(`方向图 CSV 含重复网格点 az=${sample.azimuthDeg}, el=${sample.elevationDeg}。`);
    values.set(key, sample.gainDb);
  }
  const gainDb = elevationAnglesDeg.map((elevationDeg) => azimuthAnglesDeg.map((azimuthDeg) => {
    const gain = values.get(`${azimuthDeg}\u0000${elevationDeg}`);
    if (gain === undefined) throw new Error(`方向图 CSV 缺少网格点 az=${azimuthDeg}, el=${elevationDeg}。`);
    return gain;
  }));
  return parseAntennaPatternValue({ name: "导入 CSV 方向图", azimuthAnglesDeg, elevationAnglesDeg, gainDb });
}

export function parseAntennaPatternFile(text: string, fileName: string): AntennaGainPattern {
  return fileName.toLowerCase().endsWith(".json") ? parseAntennaPatternJson(text) : parseAntennaPatternCsv(text);
}

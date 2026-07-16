import type { SteeringTableSample } from "../stores/simulationStore";
import { parseCsvRows } from "./targetImport";

const REQUIRED_HEADERS = ["timeSeconds", "azimuthDeg", "elevationDeg"] as const;

function finiteCell(value: string | undefined, rowNumber: number, field: string): number {
  if (value === undefined || value === "") throw new Error(`第 ${rowNumber} 行缺少 ${field}。`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`第 ${rowNumber} 行 ${field} 必须是有限数值。`);
  return parsed;
}

export function parseSteeringTableCsv(text: string): SteeringTableSample[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 3) throw new Error("扫描时间表至少需要表头和 2 行采样数据。");
  if (rows.length - 1 > 10_000) throw new Error("扫描时间表最多允许 10000 个采样点。");
  const headers = rows[0].map((header) => header.trim());
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`CSV 缺少字段 ${header}。表头必须包含 timeSeconds,azimuthDeg,elevationDeg。`);
    }
  }
  const column = (header: typeof REQUIRED_HEADERS[number]) => headers.indexOf(header);
  let previousTime = -Infinity;
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const sample = {
      timeSeconds: finiteCell(row[column("timeSeconds")], rowNumber, "timeSeconds"),
      azimuthDeg: finiteCell(row[column("azimuthDeg")], rowNumber, "azimuthDeg"),
      elevationDeg: finiteCell(row[column("elevationDeg")], rowNumber, "elevationDeg"),
    };
    if (sample.timeSeconds < 0) throw new Error(`第 ${rowNumber} 行 timeSeconds 不能为负数。`);
    if (sample.timeSeconds <= previousTime) throw new Error(`第 ${rowNumber} 行 timeSeconds 必须严格递增。`);
    if (Math.abs(sample.azimuthDeg) > 89) throw new Error(`第 ${rowNumber} 行 azimuthDeg 必须位于 -89～89 deg。`);
    if (Math.abs(sample.elevationDeg) > 89) throw new Error(`第 ${rowNumber} 行 elevationDeg 必须位于 -89～89 deg。`);
    previousTime = sample.timeSeconds;
    return sample;
  });
}

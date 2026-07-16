import type { AttitudeSequenceSample } from "../stores/simulationStore";
import { parseCsvRows } from "./targetImport";

const REQUIRED_HEADERS = ["timeSeconds", "rollDeg", "pitchDeg", "yawDeg"] as const;

function finiteCell(value: string | undefined, rowNumber: number, field: string): number {
  if (value === undefined || value === "") throw new Error(`第 ${rowNumber} 行缺少 ${field}。`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`第 ${rowNumber} 行 ${field} 必须是有限数值。`);
  return parsed;
}

export function parseAttitudeSequenceCsv(text: string): AttitudeSequenceSample[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 3) throw new Error("姿态序列至少需要表头和 2 行采样数据。");
  if (rows.length - 1 > 10_000) throw new Error("姿态序列最多允许 10000 个采样点。");
  const headers = rows[0].map((header) => header.trim());
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`CSV 缺少字段 ${header}。表头必须包含 timeSeconds,rollDeg,pitchDeg,yawDeg。`);
    }
  }
  const column = (header: typeof REQUIRED_HEADERS[number]) => headers.indexOf(header);
  let previousTime = -Infinity;
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const sample = {
      timeSeconds: finiteCell(row[column("timeSeconds")], rowNumber, "timeSeconds"),
      rollDeg: finiteCell(row[column("rollDeg")], rowNumber, "rollDeg"),
      pitchDeg: finiteCell(row[column("pitchDeg")], rowNumber, "pitchDeg"),
      yawDeg: finiteCell(row[column("yawDeg")], rowNumber, "yawDeg"),
    };
    if (sample.timeSeconds < 0) throw new Error(`第 ${rowNumber} 行 timeSeconds 不能为负数。`);
    if (sample.timeSeconds <= previousTime) throw new Error(`第 ${rowNumber} 行 timeSeconds 必须严格递增。`);
    for (const key of ["rollDeg", "pitchDeg", "yawDeg"] as const) {
      if (Math.abs(sample[key]) > 180) throw new Error(`第 ${rowNumber} 行 ${key} 必须位于 -180～180 deg。`);
    }
    previousTime = sample.timeSeconds;
    return sample;
  });
}

import type { AccessStatistics, AccessWindow } from "@spacedrone/orbital-core";
import type { RevisitAnalysisResult, TargetRevisitAnalysis } from "../workers/revisitAnalysis";

function csvCell(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsForKind(
  result: RevisitAnalysisResult,
  satelliteId: string,
  satelliteName: string,
  target: TargetRevisitAnalysis,
  kind: "visibility" | "coverage",
  windows: readonly AccessWindow[],
  statistics: AccessStatistics,
) {
  const source: Array<AccessWindow | undefined> = windows.length > 0 ? [...windows] : [undefined];
  return source.map((window, index) => [
    result.startUtc, result.endUtc, satelliteId, satelliteName, target.targetId, target.targetName, kind, window ? index + 1 : 0,
    window?.startSeconds, window?.endSeconds,
    window ? new Date(Date.parse(result.startUtc) + (window.startSeconds - result.startSeconds) * 1000).toISOString() : undefined,
    window ? new Date(Date.parse(result.startUtc) + (window.endSeconds - result.startSeconds) * 1000).toISOString() : undefined,
    window ? window.endSeconds - window.startSeconds : undefined,
    window?.clippedAtStart, window?.clippedAtEnd,
    statistics.accessCount, statistics.totalAccessDurationSeconds,
    statistics.coverageFraction, statistics.meanRevisitSeconds,
    statistics.minRevisitSeconds, statistics.maxRevisitSeconds,
    statistics.maxUncoveredGapSeconds,
  ]);
}

export function revisitAnalysisToCsv(result: RevisitAnalysisResult): string {
  const targetRows = (satelliteId: string, satelliteName: string, targets: readonly TargetRevisitAnalysis[]) => targets.flatMap((target) => [
    ...rowsForKind(result, satelliteId, satelliteName, target, "visibility", target.visibilityWindows, target.visibilityStatistics),
    ...rowsForKind(result, satelliteId, satelliteName, target, "coverage", target.coverageWindows, target.coverageStatistics),
  ]);
  const rows = [
    ...targetRows("constellation", "星座联合", result.targets),
    ...result.satellites.flatMap((satellite) => targetRows(satellite.satelliteId, satellite.satelliteName, satellite.targets)),
  ];
  const header = [
    "analysisStartUtc", "analysisEndUtc", "satelliteId", "satelliteName", "targetId", "targetName", "windowType", "windowIndex",
    "startSeconds", "endSeconds", "startUtc", "endUtc", "durationSeconds",
    "clippedAtStart", "clippedAtEnd", "accessCount", "totalAccessDurationSeconds", "coverageFraction",
    "meanRevisitSeconds", "minRevisitSeconds", "maxRevisitSeconds", "maxUncoveredGapSeconds",
  ];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

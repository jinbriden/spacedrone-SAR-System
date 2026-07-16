import type { TaskPlanningResult } from "../workers/taskPlanning";

function cell(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function taskPlanToCsv(result: TaskPlanningResult): string {
  const utc = (seconds: number) => new Date(Date.parse(result.startUtc) + (seconds - result.startSeconds) * 1000).toISOString();
  const rows: Array<Array<string | number | undefined>> = [];
  for (const task of result.schedule.tasks) rows.push([
    "task-summary", undefined, undefined, task.targetId, result.targetNames[task.targetId], task.priority, task.status,
    undefined, undefined, undefined, undefined, undefined,
    task.requiredDurationSeconds, task.scheduledDurationSeconds, task.remainingDurationSeconds, task.reason,
  ]);
  for (const segment of result.schedule.segments) rows.push([
    "scheduled-segment", segment.satelliteId, result.satelliteNames[segment.satelliteId], segment.targetId, result.targetNames[segment.targetId], segment.priority, "scheduled",
    segment.startSeconds, segment.endSeconds, utc(segment.startSeconds), utc(segment.endSeconds), segment.durationSeconds,
    undefined, undefined, undefined, undefined,
  ]);
  for (const opportunity of result.opportunities) rows.push([
    "opportunity", opportunity.satelliteId, opportunity.satelliteName, opportunity.targetId, opportunity.targetName, undefined, "available",
    opportunity.startSeconds, opportunity.endSeconds, utc(opportunity.startSeconds), utc(opportunity.endSeconds), opportunity.endSeconds - opportunity.startSeconds,
    undefined, undefined, undefined, undefined,
  ]);
  const header = ["recordType", "satelliteId", "satelliteName", "targetId", "targetName", "priority", "status", "startSeconds", "endSeconds", "startUtc", "endUtc", "durationSeconds", "requiredDurationSeconds", "scheduledDurationSeconds", "remainingDurationSeconds", "reason"];
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

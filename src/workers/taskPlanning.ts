import {
  scheduleObservationTasks,
  type TaskScheduleResult,
} from "@spacedrone/orbital-core";
import { computeSceneGeometry } from "../simulation/sceneGeometry";
import { computeTargetObservations } from "../simulation/targetObservation";
import type {
  AntennaConfig,
  AttitudeConfig,
  CircularOrbitConfig,
  CompanionSatelliteConfig,
  GroundTargetConfig,
  MissionTaskConfig,
  TerrainConfig,
} from "../stores/simulationStore";
import { buildRefinedAccessWindows } from "./revisitAnalysis";

export interface TaskPlanningRequest {
  orbit: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
  companionSatellites?: CompanionSatelliteConfig[];
  terrain?: TerrainConfig;
  targets: GroundTargetConfig[];
  tasks: MissionTaskConfig[];
  startSeconds: number;
  endSeconds: number;
  sampleStepSeconds: number;
  transitionToleranceSeconds: number;
}

export interface TaskOpportunityDetail {
  taskId: string;
  targetId: string;
  targetName: string;
  satelliteId: string;
  satelliteName: string;
  startSeconds: number;
  endSeconds: number;
  clippedAtStart: boolean;
  clippedAtEnd: boolean;
}

export interface TaskPlanningResult {
  startSeconds: number;
  endSeconds: number;
  startUtc: string;
  endUtc: string;
  sampleStepSeconds: number;
  transitionToleranceSeconds: number;
  coarseSampleCount: number;
  satelliteCount: number;
  opportunities: TaskOpportunityDetail[];
  schedule: TaskScheduleResult;
  satelliteNames: Record<string, string>;
  targetNames: Record<string, string>;
}

interface BooleanSample { timeSeconds: number; active: boolean }

/** Finds target-tracking opportunities for every enabled satellite/task pair, then schedules them. */
export function computeTaskPlan(request: TaskPlanningRequest): TaskPlanningResult {
  const { startSeconds, endSeconds, sampleStepSeconds, transitionToleranceSeconds } = request;
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) throw new RangeError("任务规划结束时间必须晚于非负起始时间。");
  if (!Number.isFinite(sampleStepSeconds) || sampleStepSeconds <= 0) throw new RangeError("任务规划粗采样步长必须大于 0。");
  if (!Number.isFinite(transitionToleranceSeconds) || transitionToleranceSeconds <= 0 || transitionToleranceSeconds > sampleStepSeconds) throw new RangeError("任务规划边界容差必须大于 0 且不超过粗采样步长。");
  const tasks = request.tasks.filter((task) => task.enabled);
  if (tasks.length === 0) throw new RangeError("任务规划至少需要启用 1 个目标任务。");
  const targetById = new Map(request.targets.map((target) => [target.id, target]));
  for (const task of tasks) if (!targetById.has(task.targetId)) throw new RangeError(`任务引用了不存在的目标：${task.targetId}。`);
  const satellites = [
    { id: "primary", name: "SAT-1", orbit: request.orbit, attitude: request.attitude, antenna: request.antenna },
    ...(request.companionSatellites ?? []).filter((satellite) => satellite.enabled),
  ];
  const intervalCount = Math.ceil((endSeconds - startSeconds) / sampleStepSeconds);
  const coarseSampleCount = intervalCount + 1;
  if (coarseSampleCount > 100_000) throw new RangeError("任务规划粗采样最多 100000 点，请增大步长或缩短范围。");
  if (coarseSampleCount * tasks.length * satellites.length > 100_000) throw new RangeError("任务规划的卫星数、任务数与采样点乘积不能超过 100000，请增大步长或分批规划。");
  const times = Array.from({ length: coarseSampleCount }, (_, index) => index === intervalCount ? endSeconds : startSeconds + index * sampleStepSeconds);
  const primaryEpochMs = Date.parse(request.orbit.epochUtc);
  const series = new Map<string, BooleanSample[]>();
  const key = (taskId: string, satelliteId: string) => `${taskId}\u0000${satelliteId}`;
  for (const task of tasks) for (const satellite of satellites) series.set(key(task.targetId, satellite.id), []);

  const evaluate = (task: MissionTaskConfig, satellite: typeof satellites[number], timeSeconds: number): boolean => {
    const target = targetById.get(task.targetId)!;
    const trackingAntenna: AntennaConfig = { ...satellite.antenna, taskMode: "spotlight", spotlightTargetId: target.id };
    const scene = computeSceneGeometry({
      orbit: satellite.orbit, attitude: satellite.attitude, antenna: trackingAntenna,
      targets: request.targets, elapsedSeconds: timeSeconds,
      simulationDateUtc: new Date(primaryEpochMs + timeSeconds * 1000),
      terrain: request.terrain,
    });
    return computeTargetObservations(scene, [target], request.terrain)[0].observation.insideFootprint;
  };
  for (const timeSeconds of times) {
    for (const task of tasks) for (const satellite of satellites) {
      series.get(key(task.targetId, satellite.id))!.push({ timeSeconds, active: evaluate(task, satellite, timeSeconds) });
    }
  }
  const opportunities: TaskOpportunityDetail[] = [];
  for (const task of tasks) for (const satellite of satellites) {
    const target = targetById.get(task.targetId)!;
    const windows = buildRefinedAccessWindows(
      series.get(key(task.targetId, satellite.id))!, transitionToleranceSeconds,
      (timeSeconds) => evaluate(task, satellite, timeSeconds),
    );
    for (const window of windows) opportunities.push({
      taskId: task.targetId,
      targetId: task.targetId,
      targetName: target.name,
      satelliteId: satellite.id,
      satelliteName: satellite.name,
      ...window,
    });
  }
  const schedule = scheduleObservationTasks(
    tasks.map((task) => ({
      taskId: task.targetId, targetId: task.targetId, priority: task.priority,
      requiredDurationSeconds: task.requiredDurationSeconds,
      earliestStartSeconds: task.earliestStartSeconds, latestEndSeconds: task.latestEndSeconds,
      minimumSegmentSeconds: task.minimumSegmentSeconds, allowSplit: task.allowSplit,
    })),
    opportunities,
    startSeconds,
    endSeconds,
  );
  return {
    startSeconds, endSeconds,
    startUtc: new Date(primaryEpochMs + startSeconds * 1000).toISOString(),
    endUtc: new Date(primaryEpochMs + endSeconds * 1000).toISOString(),
    sampleStepSeconds, transitionToleranceSeconds, coarseSampleCount,
    satelliteCount: satellites.length,
    opportunities, schedule,
    satelliteNames: Object.fromEntries(satellites.map((satellite) => [satellite.id, satellite.name])),
    targetNames: Object.fromEntries(request.targets.map((target) => [target.id, target.name])),
  };
}

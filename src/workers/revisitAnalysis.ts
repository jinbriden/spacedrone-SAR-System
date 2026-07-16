import {
  summarizeAccessWindows,
  type AccessStatistics,
  type AccessWindow,
} from "@spacedrone/orbital-core";
import { computeSceneGeometry } from "../simulation/sceneGeometry";
import { computeTargetObservations } from "../simulation/targetObservation";
import type {
  AntennaConfig,
  AttitudeConfig,
  CircularOrbitConfig,
  CompanionSatelliteConfig,
  GroundTargetConfig,
  TerrainConfig,
} from "../stores/simulationStore";

export interface RevisitAnalysisRequest {
  orbit: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
  targets: GroundTargetConfig[];
  companionSatellites?: CompanionSatelliteConfig[];
  terrain?: TerrainConfig;
  startSeconds: number;
  endSeconds: number;
  sampleStepSeconds: number;
  transitionToleranceSeconds: number;
}

export interface TargetRevisitAnalysis {
  targetId: string;
  targetName: string;
  visibilityWindows: AccessWindow[];
  visibilityStatistics: AccessStatistics;
  coverageWindows: AccessWindow[];
  coverageStatistics: AccessStatistics;
}

export interface RevisitAnalysisResult {
  startSeconds: number;
  endSeconds: number;
  startUtc: string;
  endUtc: string;
  sampleStepSeconds: number;
  transitionToleranceSeconds: number;
  coarseSampleCount: number;
  satelliteCount: number;
  targets: TargetRevisitAnalysis[];
  satellites: SatelliteRevisitAnalysis[];
}

export interface SatelliteRevisitAnalysis {
  satelliteId: string;
  satelliteName: string;
  targets: TargetRevisitAnalysis[];
}

interface BooleanTimeSample {
  timeSeconds: number;
  active: boolean;
}

function refineTransition(
  lowerSeconds: number,
  upperSeconds: number,
  lowerActive: boolean,
  toleranceSeconds: number,
  evaluate: (timeSeconds: number) => boolean,
): number {
  let lower = lowerSeconds;
  let upper = upperSeconds;
  while (upper - lower > toleranceSeconds) {
    const middle = (lower + upper) / 2;
    if (evaluate(middle) === lowerActive) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

/** Converts coarse Boolean samples to windows and refines every detected transition. */
export function buildRefinedAccessWindows(
  samples: readonly BooleanTimeSample[],
  transitionToleranceSeconds: number,
  evaluate: (timeSeconds: number) => boolean,
): AccessWindow[] {
  if (samples.length < 2) throw new RangeError("访问窗口提取至少需要 2 个粗采样点。");
  if (!Number.isFinite(transitionToleranceSeconds) || transitionToleranceSeconds <= 0) {
    throw new RangeError("窗口边界容差必须是正有限秒数。");
  }
  const windows: AccessWindow[] = [];
  let openStart = samples[0].active ? samples[0].timeSeconds : undefined;
  let clippedAtStart = samples[0].active;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!Number.isFinite(current.timeSeconds) || current.timeSeconds <= previous.timeSeconds) {
      throw new RangeError("访问分析粗采样时间必须严格递增。");
    }
    if (previous.active === current.active) continue;
    const transition = refineTransition(
      previous.timeSeconds,
      current.timeSeconds,
      previous.active,
      transitionToleranceSeconds,
      evaluate,
    );
    if (current.active) {
      openStart = transition;
      clippedAtStart = false;
    } else if (openStart !== undefined) {
      windows.push({ startSeconds: openStart, endSeconds: transition, clippedAtStart, clippedAtEnd: false });
      openStart = undefined;
    }
  }
  if (openStart !== undefined) {
    windows.push({
      startSeconds: openStart,
      endSeconds: samples[samples.length - 1].timeSeconds,
      clippedAtStart,
      clippedAtEnd: true,
    });
  }
  return windows;
}

/** Performs target visibility and true-footprint revisit analysis at bounded fixed-time samples. */
export function computeRevisitAnalysis(request: RevisitAnalysisRequest): RevisitAnalysisResult {
  const { startSeconds, endSeconds, sampleStepSeconds, transitionToleranceSeconds } = request;
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    throw new RangeError("重访分析结束时间必须晚于非负起始时间。");
  }
  if (!Number.isFinite(sampleStepSeconds) || sampleStepSeconds <= 0) throw new RangeError("重访分析粗采样步长必须大于 0。");
  if (!Number.isFinite(transitionToleranceSeconds) || transitionToleranceSeconds <= 0 || transitionToleranceSeconds > sampleStepSeconds) {
    throw new RangeError("窗口边界容差必须大于 0 且不超过粗采样步长。");
  }
  if (request.targets.length === 0) throw new RangeError("重访分析至少需要 1 个目标。");
  const intervalCount = Math.ceil((endSeconds - startSeconds) / sampleStepSeconds);
  const coarseSampleCount = intervalCount + 1;
  if (coarseSampleCount > 100_000) throw new RangeError("重访分析粗采样最多 100000 点，请增大步长或缩短范围。");
  const satelliteConfigs = [
    { id: "primary", name: "SAT-1", orbit: request.orbit, attitude: request.attitude, antenna: request.antenna },
    ...(request.companionSatellites ?? []).filter((satellite) => satellite.enabled),
  ];
  if (coarseSampleCount * request.targets.length * satelliteConfigs.length > 100_000) {
    throw new RangeError("重访分析的卫星数、目标数与采样点乘积不能超过 100000，请增大步长或分批分析。");
  }

  const times = Array.from({ length: coarseSampleCount }, (_, index) =>
    index === intervalCount ? endSeconds : startSeconds + index * sampleStepSeconds,
  );
  const primaryEpochMs = Date.parse(request.orbit.epochUtc);
  const series = satelliteConfigs.map((satellite) => ({
    satellite,
    visibilityByTarget: new Map(request.targets.map((target) => [target.id, [] as BooleanTimeSample[]])),
    coverageByTarget: new Map(request.targets.map((target) => [target.id, [] as BooleanTimeSample[]])),
  }));
  const evaluateSatellite = (satellite: typeof satelliteConfigs[number], timeSeconds: number) => {
    const scene = computeSceneGeometry({
      orbit: satellite.orbit,
      attitude: satellite.attitude,
      antenna: satellite.antenna,
      targets: request.targets,
      elapsedSeconds: timeSeconds,
      simulationDateUtc: new Date(primaryEpochMs + timeSeconds * 1000),
      terrain: request.terrain,
    });
    return computeTargetObservations(scene, request.targets, request.terrain);
  };
  for (const timeSeconds of times) {
    for (const satelliteSeries of series) {
      for (const observation of evaluateSatellite(satelliteSeries.satellite, timeSeconds)) {
        satelliteSeries.visibilityByTarget.get(observation.target.id)!.push({ timeSeconds, active: observation.observation.visibleAboveHorizon });
        satelliteSeries.coverageByTarget.get(observation.target.id)!.push({ timeSeconds, active: observation.observation.insideFootprint });
      }
    }
  }
  const evaluateOne = (satellite: typeof satelliteConfigs[number], target: GroundTargetConfig, kind: "visibility" | "coverage", timeSeconds: number) => {
    const match = evaluateSatellite(satellite, timeSeconds).find((item) => item.target.id === target.id)!;
    return kind === "visibility" ? match.observation.visibleAboveHorizon : match.observation.insideFootprint;
  };
  const analyzeTarget = (
    target: GroundTargetConfig,
    visibilitySamples: readonly BooleanTimeSample[],
    coverageSamples: readonly BooleanTimeSample[],
    evaluateVisibility: (timeSeconds: number) => boolean,
    evaluateCoverage: (timeSeconds: number) => boolean,
  ): TargetRevisitAnalysis => {
    const visibilityWindows = buildRefinedAccessWindows(
      visibilitySamples, transitionToleranceSeconds, evaluateVisibility,
    );
    const coverageWindows = buildRefinedAccessWindows(
      coverageSamples, transitionToleranceSeconds, evaluateCoverage,
    );
    return {
      targetId: target.id,
      targetName: target.name,
      visibilityWindows,
      visibilityStatistics: summarizeAccessWindows(visibilityWindows, startSeconds, endSeconds),
      coverageWindows,
      coverageStatistics: summarizeAccessWindows(coverageWindows, startSeconds, endSeconds),
    };
  };
  const satellites: SatelliteRevisitAnalysis[] = series.map((satelliteSeries) => ({
    satelliteId: satelliteSeries.satellite.id,
    satelliteName: satelliteSeries.satellite.name,
    targets: request.targets.map((target) => analyzeTarget(
      target,
      satelliteSeries.visibilityByTarget.get(target.id)!,
      satelliteSeries.coverageByTarget.get(target.id)!,
      (timeSeconds) => evaluateOne(satelliteSeries.satellite, target, "visibility", timeSeconds),
      (timeSeconds) => evaluateOne(satelliteSeries.satellite, target, "coverage", timeSeconds),
    )),
  }));
  const targets = request.targets.map((target) => {
    const aggregateSamples = (kind: "visibility" | "coverage") => times.map((timeSeconds, index) => ({
      timeSeconds,
      active: series.some((satelliteSeries) => (kind === "visibility" ? satelliteSeries.visibilityByTarget : satelliteSeries.coverageByTarget).get(target.id)![index].active),
    }));
    return analyzeTarget(
      target,
      aggregateSamples("visibility"),
      aggregateSamples("coverage"),
      (timeSeconds) => satelliteConfigs.some((satellite) => evaluateOne(satellite, target, "visibility", timeSeconds)),
      (timeSeconds) => satelliteConfigs.some((satellite) => evaluateOne(satellite, target, "coverage", timeSeconds)),
    );
  });
  return {
    startSeconds,
    endSeconds,
    startUtc: new Date(primaryEpochMs + startSeconds * 1000).toISOString(),
    endUtc: new Date(primaryEpochMs + endSeconds * 1000).toISOString(),
    sampleStepSeconds,
    transitionToleranceSeconds,
    coarseSampleCount,
    satelliteCount: satelliteConfigs.length,
    targets,
    satellites,
  };
}

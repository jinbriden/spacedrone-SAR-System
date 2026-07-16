import type {
  AntennaConfig,
  AttitudeConfig,
  CircularOrbitConfig,
  GroundTargetConfig,
  MissionSettings,
  SceneSnapshot,
  CoverageHistorySample,
  TimelineSettings,
  DisplaySettings,
  SteeringTableSample,
  AttitudeSequenceSample,
  CompanionSatelliteConfig,
  MissionTaskConfig,
  TerrainConfig,
  SarConfig,
} from "../stores/simulationStore";
import { defaultSar, defaultTerrain } from "../stores/simulationStore";
import type { TargetPassState, Vector3 } from "@spacedrone/orbital-core";
import { parseTleMetadata, WGS84_SEMI_MAJOR_AXIS_M } from "@spacedrone/orbital-core";
import { parseAntennaPatternValue } from "./antennaPatternImport";
import { validateAttitudeConfigLimits } from "../simulation/attitudeLimits";
import { parseTerrainHeightGridValue } from "./terrainImport";

export const SCENE_SCHEMA_VERSION = 1;
export const SCENE_FILE_KIND = "spacedrone.scene";

export interface SceneFileV1 {
  schemaVersion: 1;
  kind: typeof SCENE_FILE_KIND;
  savedAtUtc: string;
  scene: SceneSnapshot;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} 必须是对象。请使用本平台导出的场景 JSON。`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} 必须是有限数值。请检查字段和单位。`);
  }
  return value;
}

function boundedNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  const number = finiteNumber(value, path);
  if (number < minimum || number > maximum) {
    throw new Error(`${path} 必须位于 ${minimum}～${maximum}。`);
  }
  return number;
}

function positiveNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) throw new Error(`${path} 必须大于 0。`);
  return number;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} 必须是非空字符串。`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new Error(`${path} 必须是 ${choices.join("、")} 之一。`);
  }
  return value as T;
}

function parseOrbit(value: unknown): CircularOrbitConfig {
  const item = record(value, "scene.orbit");
  const epochUtc = text(item.epochUtc, "scene.orbit.epochUtc");
  if (!Number.isFinite(Date.parse(epochUtc))) {
    throw new Error("scene.orbit.epochUtc 必须是有效的 UTC ISO 8601 时间。");
  }
  const mode = oneOf(item.mode ?? "circular", "scene.orbit.mode", ["circular", "keplerian", "tle"]);
  const propagationModel = oneOf(item.propagationModel ?? "twoBody", "scene.orbit.propagationModel", ["twoBody", "j2Secular", "sgp4"]);
  if (mode === "tle" && propagationModel !== "sgp4") throw new Error("TLE 轨道输入必须使用 SGP4 传播模型。" );
  if (mode !== "tle" && propagationModel === "sgp4") throw new Error("SGP4 传播模型必须使用 TLE 轨道输入。" );
  const tleName = typeof item.tleName === "string" ? item.tleName : "";
  const tleLine1 = typeof item.tleLine1 === "string" ? item.tleLine1 : "";
  const tleLine2 = typeof item.tleLine2 === "string" ? item.tleLine2 : "";
  if (mode === "tle") parseTleMetadata(tleLine1, tleLine2);
  return {
    mode,
    propagationModel,
    earthRotationEnabled: item.earthRotationEnabled === undefined
      ? true
      : (() => {
          if (typeof item.earthRotationEnabled !== "boolean") throw new Error("scene.orbit.earthRotationEnabled 必须是布尔值。");
          return item.earthRotationEnabled;
        })(),
    altitudeM: positiveNumber(item.altitudeM, "scene.orbit.altitudeM"),
    direction: item.direction === -1 ? -1 : 1,
    semiMajorAxisM: positiveNumber(
      item.semiMajorAxisM ?? WGS84_SEMI_MAJOR_AXIS_M + finiteNumber(item.altitudeM, "scene.orbit.altitudeM"),
      "scene.orbit.semiMajorAxisM",
    ),
    eccentricity: boundedNumber(item.eccentricity ?? 0, "scene.orbit.eccentricity", 0, 0.999999),
    argumentOfPeriapsisDeg: boundedNumber(item.argumentOfPeriapsisDeg ?? 0, "scene.orbit.argumentOfPeriapsisDeg", -360, 360),
    anomalyType: oneOf(item.anomalyType ?? "mean", "scene.orbit.anomalyType", ["mean", "true"]),
    initialAnomalyDeg: boundedNumber(item.initialAnomalyDeg ?? item.initialPhaseDeg, "scene.orbit.initialAnomalyDeg", -360, 360),
    inclinationDeg: boundedNumber(item.inclinationDeg, "scene.orbit.inclinationDeg", 0, 180),
    raanDeg: boundedNumber(item.raanDeg, "scene.orbit.raanDeg", -360, 360),
    initialPhaseDeg: boundedNumber(item.initialPhaseDeg, "scene.orbit.initialPhaseDeg", -360, 360),
    epochUtc,
    tleName,
    tleLine1,
    tleLine2,
  };
}

function parseAttitude(value: unknown): AttitudeConfig {
  const item = record(value, "scene.attitude");
  const mode = oneOf(item.mode ?? "fixed", "scene.attitude.mode", ["fixed", "external"]);
  const sequence = parseAttitudeSequence(item.sequence);
  if (mode === "external" && sequence.length < 2) {
    throw new Error("外部姿态模式需要 scene.attitude.sequence 至少包含 2 个采样点。");
  }
  const attitude: AttitudeConfig = {
    mode,
    rollDeg: boundedNumber(item.rollDeg, "scene.attitude.rollDeg", -180, 180),
    pitchDeg: boundedNumber(item.pitchDeg, "scene.attitude.pitchDeg", -180, 180),
    yawDeg: boundedNumber(item.yawDeg, "scene.attitude.yawDeg", -180, 180),
    sequence,
    maxRollDeg: boundedNumber(item.maxRollDeg ?? 180, "scene.attitude.maxRollDeg", 0.001, 180),
    maxPitchDeg: boundedNumber(item.maxPitchDeg ?? 180, "scene.attitude.maxPitchDeg", 0.001, 180),
    maxYawDeg: boundedNumber(item.maxYawDeg ?? 180, "scene.attitude.maxYawDeg", 0.001, 180),
    maxAngularRateDegS: boundedNumber(item.maxAngularRateDegS ?? 30, "scene.attitude.maxAngularRateDegS", 0.001, 100_000),
    maxAngularAccelerationDegS2: boundedNumber(item.maxAngularAccelerationDegS2 ?? 10, "scene.attitude.maxAngularAccelerationDegS2", 0.001, 100_000),
  };
  validateAttitudeConfigLimits(attitude);
  return attitude;
}

function parseAttitudeSequence(value: unknown): AttitudeSequenceSample[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("scene.attitude.sequence 必须是数组。");
  if (value.length > 10_000) throw new Error("scene.attitude.sequence 最多包含 10000 个采样点。");
  let previousTime = -Infinity;
  return value.map((rawSample, index) => {
    const path = `scene.attitude.sequence[${index}]`;
    const sample = record(rawSample, path);
    const timeSeconds = boundedNumber(sample.timeSeconds, `${path}.timeSeconds`, 0, 315576000);
    if (timeSeconds <= previousTime) throw new Error("scene.attitude.sequence 时间必须严格递增。");
    previousTime = timeSeconds;
    return {
      timeSeconds,
      rollDeg: boundedNumber(sample.rollDeg, `${path}.rollDeg`, -180, 180),
      pitchDeg: boundedNumber(sample.pitchDeg, `${path}.pitchDeg`, -180, 180),
      yawDeg: boundedNumber(sample.yawDeg, `${path}.yawDeg`, -180, 180),
    };
  });
}

function parseAntenna(value: unknown): AntennaConfig {
  const item = record(value, "scene.antenna");
  const beamType = oneOf(item.beamType, "scene.antenna.beamType", ["circular", "rectangular", "pattern"]);
  const gainPattern = item.gainPattern === undefined || item.gainPattern === null
    ? null
    : parseAntennaPatternValue(item.gainPattern);
  if (beamType === "pattern" && gainPattern === null) {
    throw new Error("二维方向图波束需要 scene.antenna.gainPattern。" );
  }
  const arrayFeeds = (() => {
    if (item.arrayFeeds === undefined) return [];
    if (!Array.isArray(item.arrayFeeds)) throw new Error("scene.antenna.arrayFeeds 必须是数组。");
    if (item.arrayFeeds.length > 31) throw new Error("scene.antenna.arrayFeeds 最多包含 31 个附加馈源。");
    const ids = new Set<string>();
    return item.arrayFeeds.map((rawFeed, index) => {
      const path = `scene.antenna.arrayFeeds[${index}]`;
      const feed = record(rawFeed, path);
      const id = text(feed.id, `${path}.id`);
      if (ids.has(id)) throw new Error("scene.antenna.arrayFeeds 的馈源 ID 必须唯一。");
      ids.add(id);
      const color = text(feed.color ?? "#ff7875", `${path}.color`);
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${path}.color 必须是 #RRGGBB 颜色。`);
      if (typeof feed.enabled !== "boolean") throw new Error(`${path}.enabled 必须是布尔值。`);
      return {
        id,
        name: text(feed.name, `${path}.name`),
        enabled: feed.enabled,
        offsetXM: boundedNumber(feed.offsetXM ?? 0, `${path}.offsetXM`, -1000, 1000),
        offsetYM: boundedNumber(feed.offsetYM ?? 0, `${path}.offsetYM`, -1000, 1000),
        offsetZM: boundedNumber(feed.offsetZM ?? 0, `${path}.offsetZM`, -1000, 1000),
        steeringAzimuthOffsetDeg: boundedNumber(feed.steeringAzimuthOffsetDeg ?? 0, `${path}.steeringAzimuthOffsetDeg`, -89, 89),
        steeringElevationOffsetDeg: boundedNumber(feed.steeringElevationOffsetDeg ?? 0, `${path}.steeringElevationOffsetDeg`, -89, 89),
        beamwidthScale: boundedNumber(feed.beamwidthScale ?? 1, `${path}.beamwidthScale`, 0.01, 100),
        relativePowerDb: boundedNumber(feed.relativePowerDb ?? 0, `${path}.relativePowerDb`, -100, 100),
        color,
      };
    });
  })();
  return {
    name: text(item.name, "scene.antenna.name"),
    taskMode: oneOf(item.taskMode ?? "generic", "scene.antenna.taskMode", ["generic", "stripmap", "spotlight", "scanSar", "tops"]),
    spotlightTargetId: typeof item.spotlightTargetId === "string" ? item.spotlightTargetId : "",
    scanSarElevationAnglesDeg: parseScanSarAngles(item.scanSarElevationAnglesDeg),
    scanSarBurstDurationSeconds: positiveNumber(item.scanSarBurstDurationSeconds ?? 10, "scene.antenna.scanSarBurstDurationSeconds"),
    topsStartAzimuthDeg: boundedNumber(item.topsStartAzimuthDeg ?? -20, "scene.antenna.topsStartAzimuthDeg", -89, 89),
    topsEndAzimuthDeg: boundedNumber(item.topsEndAzimuthDeg ?? 20, "scene.antenna.topsEndAzimuthDeg", -89, 89),
    topsSweepDurationSeconds: positiveNumber(item.topsSweepDurationSeconds ?? 20, "scene.antenna.topsSweepDurationSeconds"),
    mountOffsetXM: boundedNumber(item.mountOffsetXM ?? 0, "scene.antenna.mountOffsetXM", -1000, 1000),
    mountOffsetYM: boundedNumber(item.mountOffsetYM ?? 0, "scene.antenna.mountOffsetYM", -1000, 1000),
    mountOffsetZM: boundedNumber(item.mountOffsetZM ?? 0, "scene.antenna.mountOffsetZM", -1000, 1000),
    mountRollDeg: boundedNumber(item.mountRollDeg, "scene.antenna.mountRollDeg", -180, 180),
    mountPitchDeg: boundedNumber(item.mountPitchDeg, "scene.antenna.mountPitchDeg", -180, 180),
    mountYawDeg: boundedNumber(item.mountYawDeg, "scene.antenna.mountYawDeg", -180, 180),
    beamType,
    gainPattern,
    patternThresholdDbBelowPeak: boundedNumber(item.patternThresholdDbBelowPeak ?? 3, "scene.antenna.patternThresholdDbBelowPeak", 0.01, 100),
    steeringAzimuthDeg: boundedNumber(item.steeringAzimuthDeg, "scene.antenna.steeringAzimuthDeg", -89, 89),
    steeringElevationDeg: boundedNumber(item.steeringElevationDeg, "scene.antenna.steeringElevationDeg", -89, 89),
    circularBeamwidthDeg: boundedNumber(item.circularBeamwidthDeg, "scene.antenna.circularBeamwidthDeg", 0.01, 179),
    azimuthBeamwidthDeg: boundedNumber(item.azimuthBeamwidthDeg, "scene.antenna.azimuthBeamwidthDeg", 0.01, 179),
    elevationBeamwidthDeg: boundedNumber(item.elevationBeamwidthDeg, "scene.antenna.elevationBeamwidthDeg", 0.01, 179),
    boundarySamples: Math.round(boundedNumber(item.boundarySamples, "scene.antenna.boundarySamples", 16, 2048)),
    maxDisplayDistanceM: positiveNumber(item.maxDisplayDistanceM, "scene.antenna.maxDisplayDistanceM"),
    scanMode: oneOf(item.scanMode, "scene.antenna.scanMode", ["fixed", "sine", "linear", "custom"]),
    scanAxis: oneOf(item.scanAxis, "scene.antenna.scanAxis", ["azimuth", "elevation"]),
    scanAmplitudeDeg: boundedNumber(item.scanAmplitudeDeg, "scene.antenna.scanAmplitudeDeg", 0, 89),
    scanPeriodSeconds: positiveNumber(item.scanPeriodSeconds, "scene.antenna.scanPeriodSeconds"),
    scanPhaseDeg: boundedNumber(item.scanPhaseDeg, "scene.antenna.scanPhaseDeg", -360, 360),
    steeringTable: (() => {
      const table = parseSteeringTable(item.steeringTable);
      if (item.scanMode === "custom" && table.length < 2) {
        throw new Error("自定义扫描模式需要 scene.antenna.steeringTable 至少包含 2 个采样点。");
      }
      return table;
    })(),
    maxScanAngleDeg: boundedNumber(item.maxScanAngleDeg ?? 60, "scene.antenna.maxScanAngleDeg", 0.1, 89),
    beamColor: (() => {
      const color = text(item.beamColor ?? "#fadb14", "scene.antenna.beamColor");
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("scene.antenna.beamColor 必须是 #RRGGBB 颜色。");
      return color;
    })(),
    beamOpacity: boundedNumber(item.beamOpacity ?? 0.2, "scene.antenna.beamOpacity", 0.01, 1),
    arrayFeeds,
  };
}

function parseScanSarAngles(value: unknown): number[] {
  if (value === undefined) return [-20, 0, 20];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("scene.antenna.scanSarElevationAnglesDeg 必须是非空数组。");
  }
  if (value.length > 32) throw new Error("ScanSAR 最多支持 32 个子测绘带角度。");
  return value.map((angle, index) => boundedNumber(
    angle,
    `scene.antenna.scanSarElevationAnglesDeg[${index}]`,
    -89,
    89,
  ));
}

function parseSteeringTable(value: unknown): SteeringTableSample[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("scene.antenna.steeringTable 必须是数组。");
  if (value.length > 10_000) throw new Error("scene.antenna.steeringTable 最多包含 10000 个采样点。");
  let previousTime = -Infinity;
  return value.map((rawSample, index) => {
    const path = `scene.antenna.steeringTable[${index}]`;
    const sample = record(rawSample, path);
    const timeSeconds = boundedNumber(sample.timeSeconds, `${path}.timeSeconds`, 0, 315576000);
    if (timeSeconds <= previousTime) throw new Error("scene.antenna.steeringTable 时间必须严格递增。");
    previousTime = timeSeconds;
    return {
      timeSeconds,
      azimuthDeg: boundedNumber(sample.azimuthDeg, `${path}.azimuthDeg`, -89, 89),
      elevationDeg: boundedNumber(sample.elevationDeg, `${path}.elevationDeg`, -89, 89),
    };
  });
}

function parseTargets(value: unknown): GroundTargetConfig[] {
  if (!Array.isArray(value)) throw new Error("scene.targets 必须是数组。");
  const ids = new Set<string>();
  return value.map((rawTarget, index) => {
    const path = `scene.targets[${index}]`;
    const item = record(rawTarget, path);
    const id = text(item.id, `${path}.id`);
    if (id === "primary") throw new Error(`${path}.id 不能使用保留值 primary。`);
    if (ids.has(id)) throw new Error(`${path}.id 与其他目标重复。`);
    ids.add(id);
    const targetType = oneOf(item.targetType ?? "point", `${path}.targetType`, ["point", "circle", "rectangle", "polygon"]);
    const vertices = (() => {
      if (item.vertices === undefined) return [];
      if (!Array.isArray(item.vertices)) throw new Error(`${path}.vertices 必须是数组。`);
      if (item.vertices.length > 10_000) throw new Error(`${path}.vertices 最多支持 10000 个顶点。`);
      return item.vertices.map((rawVertex, vertexIndex) => {
        const vertex = record(rawVertex, `${path}.vertices[${vertexIndex}]`);
        return {
          longitudeDeg: boundedNumber(vertex.longitudeDeg, `${path}.vertices[${vertexIndex}].longitudeDeg`, -180, 180),
          latitudeDeg: boundedNumber(vertex.latitudeDeg, `${path}.vertices[${vertexIndex}].latitudeDeg`, -90, 90),
        };
      });
    })();
    if (targetType === "polygon" && vertices.length < 3) throw new Error(`${path}.vertices 多边形至少需要 3 个顶点。`);
    const radiusM = boundedNumber(item.radiusM ?? (targetType === "circle" ? 50_000 : 0), `${path}.radiusM`, 0, 20_000_000);
    const widthM = boundedNumber(item.widthM ?? (targetType === "rectangle" ? 100_000 : 0), `${path}.widthM`, 0, 20_000_000);
    const heightM = boundedNumber(item.heightM ?? (targetType === "rectangle" ? 80_000 : 0), `${path}.heightM`, 0, 20_000_000);
    if (targetType === "circle" && radiusM <= 0) throw new Error(`${path}.radiusM 圆形区域半径必须大于 0。`);
    if (targetType === "rectangle" && (widthM <= 0 || heightM <= 0)) throw new Error(`${path} 矩形区域宽度和高度必须大于 0。`);
    return {
      id,
      name: text(item.name, `${path}.name`),
      targetType,
      longitudeDeg: boundedNumber(item.longitudeDeg, `${path}.longitudeDeg`, -180, 180),
      latitudeDeg: boundedNumber(item.latitudeDeg, `${path}.latitudeDeg`, -90, 90),
      altitudeM: boundedNumber(item.altitudeM, `${path}.altitudeM`, -10000, 10000000),
      radiusM,
      widthM,
      heightM,
      vertices,
    };
  });
}

function parseMissionSettings(value: unknown): MissionSettings {
  const item = record(value, "scene.missionSettings");
  if (typeof item.historyEnabled !== "boolean") {
    throw new Error("scene.missionSettings.historyEnabled 必须是布尔值。");
  }
  const revisitStartSeconds = boundedNumber(item.revisitStartSeconds ?? 0, "scene.missionSettings.revisitStartSeconds", 0, 315576000);
  const revisitEndSeconds = boundedNumber(item.revisitEndSeconds ?? 86_400, "scene.missionSettings.revisitEndSeconds", 0, 315576000);
  const revisitSampleStepSeconds = positiveNumber(item.revisitSampleStepSeconds ?? 5, "scene.missionSettings.revisitSampleStepSeconds");
  const revisitTransitionToleranceSeconds = positiveNumber(item.revisitTransitionToleranceSeconds ?? 0.1, "scene.missionSettings.revisitTransitionToleranceSeconds");
  const taskPlanStartSeconds = boundedNumber(item.taskPlanStartSeconds ?? 0, "scene.missionSettings.taskPlanStartSeconds", 0, 315576000);
  const taskPlanEndSeconds = boundedNumber(item.taskPlanEndSeconds ?? 86_400, "scene.missionSettings.taskPlanEndSeconds", 0, 315576000);
  const taskPlanSampleStepSeconds = positiveNumber(item.taskPlanSampleStepSeconds ?? 10, "scene.missionSettings.taskPlanSampleStepSeconds");
  const taskPlanTransitionToleranceSeconds = positiveNumber(item.taskPlanTransitionToleranceSeconds ?? 0.1, "scene.missionSettings.taskPlanTransitionToleranceSeconds");
  if (revisitEndSeconds <= revisitStartSeconds) throw new Error("scene.missionSettings.revisitEndSeconds 必须晚于 revisitStartSeconds。");
  if (revisitTransitionToleranceSeconds > revisitSampleStepSeconds) throw new Error("重访分析边界容差不能超过粗采样步长。");
  if (taskPlanEndSeconds <= taskPlanStartSeconds) throw new Error("scene.missionSettings.taskPlanEndSeconds 必须晚于 taskPlanStartSeconds。");
  if (taskPlanTransitionToleranceSeconds > taskPlanSampleStepSeconds) throw new Error("任务规划边界容差不能超过粗采样步长。");
  return {
    targetSampleStepSeconds: positiveNumber(item.targetSampleStepSeconds, "scene.missionSettings.targetSampleStepSeconds"),
    historyEnabled: item.historyEnabled,
    historySampleIntervalSeconds: positiveNumber(item.historySampleIntervalSeconds, "scene.missionSettings.historySampleIntervalSeconds"),
    maxHistoryFootprints: Math.round(boundedNumber(item.maxHistoryFootprints, "scene.missionSettings.maxHistoryFootprints", 1, 5000)),
    historyDisplayMode: oneOf(item.historyDisplayMode ?? "footprints", "scene.missionSettings.historyDisplayMode", ["footprints", "union"]),
    revisitStartSeconds,
    revisitEndSeconds,
    revisitSampleStepSeconds,
    revisitTransitionToleranceSeconds,
    taskPlanStartSeconds,
    taskPlanEndSeconds,
    taskPlanSampleStepSeconds,
    taskPlanTransitionToleranceSeconds,
  };
}

function parseTaskRequirements(value: unknown, targets: readonly GroundTargetConfig[]): Record<string, MissionTaskConfig> {
  if (value === undefined) return {};
  const item = record(value, "scene.taskRequirements");
  const targetIds = new Set(targets.map((target) => target.id));
  const result: Record<string, MissionTaskConfig> = {};
  for (const [targetId, rawTask] of Object.entries(item)) {
    const path = `scene.taskRequirements.${targetId}`;
    if (!targetIds.has(targetId)) throw new Error(`${path} 引用了不存在的目标。`);
    const task = record(rawTask, path);
    if (typeof task.enabled !== "boolean" || typeof task.allowSplit !== "boolean") throw new Error(`${path}.enabled 和 allowSplit 必须是布尔值。`);
    const priority = boundedNumber(task.priority, `${path}.priority`, 1, 10);
    if (!Number.isInteger(priority)) throw new Error(`${path}.priority 必须是整数。`);
    const requiredDurationSeconds = positiveNumber(task.requiredDurationSeconds, `${path}.requiredDurationSeconds`);
    const earliestStartSeconds = boundedNumber(task.earliestStartSeconds, `${path}.earliestStartSeconds`, 0, 315576000);
    const latestEndSeconds = boundedNumber(task.latestEndSeconds, `${path}.latestEndSeconds`, 0, 315576000);
    const minimumSegmentSeconds = positiveNumber(task.minimumSegmentSeconds, `${path}.minimumSegmentSeconds`);
    if (latestEndSeconds <= earliestStartSeconds) throw new Error(`${path}.latestEndSeconds 必须晚于 earliestStartSeconds。`);
    if (minimumSegmentSeconds > requiredDurationSeconds) throw new Error(`${path}.minimumSegmentSeconds 不能超过 requiredDurationSeconds。`);
    result[targetId] = { targetId, enabled: task.enabled, priority, requiredDurationSeconds, earliestStartSeconds, latestEndSeconds, minimumSegmentSeconds, allowSplit: task.allowSplit };
  }
  return result;
}

function parseTimelineSettings(value: unknown): TimelineSettings {
  if (value === undefined) return { startSeconds: 0, endSeconds: 6000 };
  const item = record(value, "scene.timelineSettings");
  const startSeconds = boundedNumber(item.startSeconds, "scene.timelineSettings.startSeconds", 0, 315576000);
  const endSeconds = boundedNumber(item.endSeconds, "scene.timelineSettings.endSeconds", 0, 315576000);
  if (endSeconds <= startSeconds) throw new Error("scene.timelineSettings.endSeconds 必须晚于 startSeconds。");
  return { startSeconds, endSeconds };
}

function parseCompanionSatellites(value: unknown, targets: readonly GroundTargetConfig[]): CompanionSatelliteConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("scene.companionSatellites 必须是数组。");
  if (value.length > 31) throw new Error("伴飞星最多支持 31 颗（加主星共 32 颗）。");
  const usedIds = new Set<string>();
  return value.map((rawSatellite, index) => {
    const path = `scene.companionSatellites[${index}]`;
    const item = record(rawSatellite, path);
    const id = text(item.id, `${path}.id`);
    if (usedIds.has(id)) throw new Error(`伴飞星 ID 重复：${id}。`);
    usedIds.add(id);
    const color = text(item.color, `${path}.color`);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${path}.color 必须是 #RRGGBB 颜色。`);
    if (typeof item.enabled !== "boolean") throw new Error(`${path}.enabled 必须是布尔值。`);
    const antenna = parseAntenna(item.antenna);
    if (antenna.taskMode === "spotlight" && !targets.some((target) => target.id === antenna.spotlightTargetId)) {
      throw new Error(`${path}.antenna.spotlightTargetId 必须引用存在的目标。`);
    }
    return {
      id,
      name: text(item.name, `${path}.name`),
      color,
      enabled: item.enabled,
      orbit: parseOrbit(item.orbit),
      attitude: parseAttitude(item.attitude),
      antenna,
    };
  });
}

function parseTerrain(value: unknown): TerrainConfig {
  if (value === undefined) return { ...defaultTerrain };
  const item = record(value, "scene.terrain");
  const booleanValue = (key: "enabled" | "fallbackToEllipsoid" | "lineOfSightEnabled", fallback: boolean) => {
    const raw = item[key] ?? fallback;
    if (typeof raw !== "boolean") throw new Error(`scene.terrain.${key} 必须是布尔值。`);
    return raw;
  };
  const grid = item.grid === undefined || item.grid === null ? null : parseTerrainHeightGridValue(item.grid);
  const enabled = booleanValue("enabled", false);
  if (enabled && !grid) throw new Error("启用地形时 scene.terrain.grid 不能为空。" );
  const color = typeof item.color === "string" ? item.color : defaultTerrain.color;
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("scene.terrain.color 必须是 #RRGGBB 颜色。");
  return {
    enabled,
    grid,
    fallbackToEllipsoid: booleanValue("fallbackToEllipsoid", true),
    rayToleranceM: boundedNumber(item.rayToleranceM ?? 0.1, "scene.terrain.rayToleranceM", 0.001, 100),
    lineOfSightEnabled: booleanValue("lineOfSightEnabled", true),
    lineOfSightSampleSpacingM: boundedNumber(item.lineOfSightSampleSpacingM ?? 1000, "scene.terrain.lineOfSightSampleSpacingM", 1, 1_000_000),
    lineOfSightClearanceM: boundedNumber(item.lineOfSightClearanceM ?? 0, "scene.terrain.lineOfSightClearanceM", 0, 100_000),
    color,
    opacity: boundedNumber(item.opacity ?? 0.55, "scene.terrain.opacity", 0, 1),
  };
}

function parseSar(value: unknown, targetIds: Set<string>): SarConfig {
  if (value === undefined) return { ...defaultSar };
  const item = record(value, "scene.sar");
  const targetId = typeof item.targetId === "string" ? item.targetId : "";
  if (targetId && !targetIds.has(targetId)) throw new Error("scene.sar.targetId 必须引用存在的目标。");
  const foldRangeAmbiguity = item.foldRangeAmbiguity ?? defaultSar.foldRangeAmbiguity;
  if (typeof foldRangeAmbiguity !== "boolean") throw new Error("scene.sar.foldRangeAmbiguity 必须是布尔值。");
  return {
    targetId,
    analysisCenterSeconds: boundedNumber(item.analysisCenterSeconds ?? defaultSar.analysisCenterSeconds, "scene.sar.analysisCenterSeconds", 0, 315576000),
    carrierFrequencyHz: positiveNumber(item.carrierFrequencyHz ?? defaultSar.carrierFrequencyHz, "scene.sar.carrierFrequencyHz"),
    chirpBandwidthHz: positiveNumber(item.chirpBandwidthHz ?? defaultSar.chirpBandwidthHz, "scene.sar.chirpBandwidthHz"),
    pulseWidthSeconds: positiveNumber(item.pulseWidthSeconds ?? defaultSar.pulseWidthSeconds, "scene.sar.pulseWidthSeconds"),
    prfHz: positiveNumber(item.prfHz ?? defaultSar.prfHz, "scene.sar.prfHz"),
    samplingRateHz: positiveNumber(item.samplingRateHz ?? defaultSar.samplingRateHz, "scene.sar.samplingRateHz"),
    apertureDurationSeconds: positiveNumber(item.apertureDurationSeconds ?? defaultSar.apertureDurationSeconds, "scene.sar.apertureDurationSeconds"),
    fastTimeMarginSeconds: boundedNumber(item.fastTimeMarginSeconds ?? defaultSar.fastTimeMarginSeconds, "scene.sar.fastTimeMarginSeconds", 0, 1),
    echoPulseCount: Math.round(boundedNumber(item.echoPulseCount ?? defaultSar.echoPulseCount, "scene.sar.echoPulseCount", 2, 4096)),
    targetRcsM2: positiveNumber(item.targetRcsM2 ?? defaultSar.targetRcsM2, "scene.sar.targetRcsM2"),
    noiseStandardDeviation: boundedNumber(item.noiseStandardDeviation ?? defaultSar.noiseStandardDeviation, "scene.sar.noiseStandardDeviation", 0, 1_000_000),
    randomSeed: Math.round(boundedNumber(item.randomSeed ?? defaultSar.randomSeed, "scene.sar.randomSeed", 0, 4_294_967_295)),
    foldRangeAmbiguity,
    receiveChannelCount: Math.round(boundedNumber(item.receiveChannelCount ?? defaultSar.receiveChannelCount, "scene.sar.receiveChannelCount", 2, 32)),
    receiveChannelSpacingM: positiveNumber(item.receiveChannelSpacingM ?? defaultSar.receiveChannelSpacingM, "scene.sar.receiveChannelSpacingM"),
    multiChannelPulseCount: Math.round(boundedNumber(item.multiChannelPulseCount ?? defaultSar.multiChannelPulseCount, "scene.sar.multiChannelPulseCount", 2, 512)),
    dbfSteeringDopplerHz: boundedNumber(item.dbfSteeringDopplerHz ?? defaultSar.dbfSteeringDopplerHz, "scene.sar.dbfSteeringDopplerHz", -1e9, 1e9),
    imagingAlgorithmId: oneOf(item.imagingAlgorithmId ?? defaultSar.imagingAlgorithmId, "scene.sar.imagingAlgorithmId", ["reference-range-backprojection"]),
    imagingMaximumRangePixels: Math.round(boundedNumber(item.imagingMaximumRangePixels ?? defaultSar.imagingMaximumRangePixels, "scene.sar.imagingMaximumRangePixels", 16, 4096)),
  };
}

function parseDisplaySettings(value: unknown): DisplaySettings {
  const defaults: DisplaySettings = {
    showEarthTexture: true, showGrid: true, showBorders: true, showEarthReferences: false, lightingEnabled: false,
    showOrbit: true, showGroundTrack: true, showAxes: true,
    showBeam: true, showFootprint: true, showTargets: true, showHistory: true,
    satelliteScale: 1,
    satelliteModelUrl: "",
    cameraMode: "free",
  };
  if (value === undefined) return defaults;
  const item = record(value, "scene.displaySettings");
  const booleanValue = (key: keyof DisplaySettings, fallback?: boolean): boolean => {
    const raw = item[key];
    if (raw === undefined && fallback !== undefined) return fallback;
    if (typeof raw !== "boolean") throw new Error(`scene.displaySettings.${key} 必须是布尔值。`);
    return raw;
  };
  return {
    showEarthTexture: booleanValue("showEarthTexture", defaults.showEarthTexture),
    showGrid: booleanValue("showGrid"),
    showBorders: booleanValue("showBorders", defaults.showBorders),
    showEarthReferences: booleanValue("showEarthReferences", defaults.showEarthReferences),
    lightingEnabled: booleanValue("lightingEnabled", defaults.lightingEnabled),
    showOrbit: booleanValue("showOrbit"),
    showGroundTrack: booleanValue("showGroundTrack"),
    showAxes: booleanValue("showAxes"),
    showBeam: booleanValue("showBeam"),
    showFootprint: booleanValue("showFootprint"),
    showTargets: booleanValue("showTargets"),
    showHistory: booleanValue("showHistory"),
    satelliteScale: boundedNumber(item.satelliteScale ?? defaults.satelliteScale, "scene.displaySettings.satelliteScale", 0.25, 4),
    satelliteModelUrl: typeof item.satelliteModelUrl === "string" ? item.satelliteModelUrl : defaults.satelliteModelUrl,
    cameraMode: oneOf(item.cameraMode, "scene.displaySettings.cameraMode", ["free", "satellite", "subpoint", "beamCenter"]),
  };
}

function optionalNonNegative(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  return boundedNumber(value, path, 0, 315576000);
}

function parseTargetPasses(
  value: unknown,
  targets: GroundTargetConfig[],
): Record<string, TargetPassState> {
  const source = record(value, "scene.targetPasses");
  const targetIds = new Set(targets.map((target) => target.id));
  const result: Record<string, TargetPassState> = {};
  for (const [id, rawPass] of Object.entries(source)) {
    if (!targetIds.has(id)) throw new Error(`scene.targetPasses.${id} 没有对应目标。`);
    const pass = record(rawPass, `scene.targetPasses.${id}`);
    if (typeof pass.wasInside !== "boolean") {
      throw new Error(`scene.targetPasses.${id}.wasInside 必须是布尔值。`);
    }
    result[id] = {
      firstEntrySeconds: optionalNonNegative(pass.firstEntrySeconds, `scene.targetPasses.${id}.firstEntrySeconds`),
      lastExitSeconds: optionalNonNegative(pass.lastExitSeconds, `scene.targetPasses.${id}.lastExitSeconds`),
      currentEntrySeconds: optionalNonNegative(pass.currentEntrySeconds, `scene.targetPasses.${id}.currentEntrySeconds`),
      cumulativeIlluminationSeconds: boundedNumber(pass.cumulativeIlluminationSeconds, `scene.targetPasses.${id}.cumulativeIlluminationSeconds`, 0, 315576000),
      lastSampleSeconds: optionalNonNegative(pass.lastSampleSeconds, `scene.targetPasses.${id}.lastSampleSeconds`),
      wasInside: pass.wasInside,
    };
  }
  return result;
}

function parseCoverageHistory(value: unknown): CoverageHistorySample[] {
  if (!Array.isArray(value)) throw new Error("scene.coverageHistory 必须是数组。");
  if (value.length > 5000) throw new Error("scene.coverageHistory 最多保存 5000 个覆盖区。");
  let previousTime = -Infinity;
  return value.map((rawSample, sampleIndex) => {
    const path = `scene.coverageHistory[${sampleIndex}]`;
    const sample = record(rawSample, path);
    const timeSeconds = boundedNumber(sample.timeSeconds, `${path}.timeSeconds`, 0, 315576000);
    if (timeSeconds <= previousTime) throw new Error("scene.coverageHistory 必须按时间严格递增。");
    previousTime = timeSeconds;
    if (!Array.isArray(sample.verticesEcefM) || sample.verticesEcefM.length < 3) {
      throw new Error(`${path}.verticesEcefM 至少需要 3 个 ECEF 顶点。`);
    }
    const verticesEcefM = sample.verticesEcefM.map((rawPoint, pointIndex) => {
      if (!Array.isArray(rawPoint) || rawPoint.length !== 3) {
        throw new Error(`${path}.verticesEcefM[${pointIndex}] 必须是三个米制坐标。`);
      }
      return [
        finiteNumber(rawPoint[0], `${path}.verticesEcefM[${pointIndex}][0]`),
        finiteNumber(rawPoint[1], `${path}.verticesEcefM[${pointIndex}][1]`),
        finiteNumber(rawPoint[2], `${path}.verticesEcefM[${pointIndex}][2]`),
      ] as Vector3;
    });
    const beamFootprints = sample.beamFootprints === undefined ? undefined : (() => {
      if (!Array.isArray(sample.beamFootprints) || sample.beamFootprints.length > 32) {
        throw new Error(`${path}.beamFootprints 必须是最多 32 项的数组。`);
      }
      return sample.beamFootprints.map((rawBeam, beamIndex) => {
        const beamPath = `${path}.beamFootprints[${beamIndex}]`;
        const beam = record(rawBeam, beamPath);
        const color = text(beam.color, `${beamPath}.color`);
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${beamPath}.color 必须是 #RRGGBB 颜色。`);
        if (!Array.isArray(beam.verticesEcefM) || beam.verticesEcefM.length < 3) throw new Error(`${beamPath}.verticesEcefM 至少需要 3 个顶点。`);
        return {
          beamId: text(beam.beamId, `${beamPath}.beamId`),
          beamName: text(beam.beamName, `${beamPath}.beamName`),
          color,
          verticesEcefM: beam.verticesEcefM.map((rawPoint, pointIndex) => {
            if (!Array.isArray(rawPoint) || rawPoint.length !== 3) throw new Error(`${beamPath}.verticesEcefM[${pointIndex}] 必须是三个米制坐标。`);
            return [
              finiteNumber(rawPoint[0], `${beamPath}.verticesEcefM[${pointIndex}][0]`),
              finiteNumber(rawPoint[1], `${beamPath}.verticesEcefM[${pointIndex}][1]`),
              finiteNumber(rawPoint[2], `${beamPath}.verticesEcefM[${pointIndex}][2]`),
            ] as Vector3;
          }),
        };
      });
    })();
    return beamFootprints === undefined
      ? { timeSeconds, verticesEcefM }
      : { timeSeconds, verticesEcefM, beamFootprints };
  });
}

export function parseSceneFile(value: unknown): SceneFileV1 {
  const file = record(value, "场景文件");
  if (file.schemaVersion === undefined) {
    throw new Error("场景文件缺少 schemaVersion。请先用兼容版本重新导出或迁移为版本 1。");
  }
  if (file.schemaVersion !== SCENE_SCHEMA_VERSION) {
    throw new Error(`不支持 schemaVersion=${String(file.schemaVersion)}。当前版本仅支持版本 1，请先迁移文件。`);
  }
  if (file.kind !== SCENE_FILE_KIND) {
    throw new Error(`kind 必须是 ${SCENE_FILE_KIND}，该 JSON 不是有效场景文件。`);
  }
  const rawScene = record(file.scene, "scene");
  const savedAtUtc = text(file.savedAtUtc, "savedAtUtc");
  if (!Number.isFinite(Date.parse(savedAtUtc))) throw new Error("savedAtUtc 必须是有效 UTC 时间。");
  const targets = parseTargets(rawScene.targets);
  const antenna = parseAntenna(rawScene.antenna);
  if (antenna.taskMode === "spotlight" && !targets.some((target) => target.id === antenna.spotlightTargetId)) {
    throw new Error("scene.antenna.spotlightTargetId 必须引用 scene.targets 中存在的目标。");
  }
  const timelineSettings = parseTimelineSettings(rawScene.timelineSettings);
  const elapsedSeconds = boundedNumber(rawScene.elapsedSeconds, "scene.elapsedSeconds", 0, 315576000);
  if (elapsedSeconds < timelineSettings.startSeconds || elapsedSeconds > timelineSettings.endSeconds) {
    throw new Error("scene.elapsedSeconds 必须位于时间轴 startSeconds 与 endSeconds 之间。");
  }
  const targetPasses = parseTargetPasses(rawScene.targetPasses, targets);
  const coverageHistory = parseCoverageHistory(rawScene.coverageHistory);
  if (Object.values(targetPasses).some((pass) => (pass.lastSampleSeconds ?? 0) > elapsedSeconds)) {
    throw new Error("目标统计的 lastSampleSeconds 不能晚于当前仿真时间。");
  }
  if ((coverageHistory.at(-1)?.timeSeconds ?? 0) > elapsedSeconds) {
    throw new Error("累计覆盖区时间不能晚于当前仿真时间。");
  }
  return {
    schemaVersion: 1,
    kind: SCENE_FILE_KIND,
    savedAtUtc,
    scene: {
      orbit: parseOrbit(rawScene.orbit),
      attitude: parseAttitude(rawScene.attitude),
      antenna,
      targets,
      missionSettings: parseMissionSettings(rawScene.missionSettings),
      timelineSettings,
      displaySettings: parseDisplaySettings(rawScene.displaySettings),
      elapsedSeconds,
      playbackRate: boundedNumber(rawScene.playbackRate, "scene.playbackRate", 0.1, 1000),
      targetPasses,
      coverageHistory,
      companionSatellites: parseCompanionSatellites(rawScene.companionSatellites, targets),
      taskRequirements: parseTaskRequirements(rawScene.taskRequirements, targets),
      terrain: parseTerrain(rawScene.terrain),
      sar: parseSar(rawScene.sar, new Set(targets.map((target) => target.id))),
    },
  };
}

export function parseSceneFileJson(json: string): SceneFileV1 {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("场景文件不是有效 JSON。请检查文件是否完整。" );
  }
  return parseSceneFile(value);
}

export function createSceneFile(scene: SceneSnapshot, savedAtUtc = new Date().toISOString()): SceneFileV1 {
  return parseSceneFile({
    schemaVersion: SCENE_SCHEMA_VERSION,
    kind: SCENE_FILE_KIND,
    savedAtUtc,
    scene,
  });
}

export function serializeSceneFile(scene: SceneSnapshot, savedAtUtc?: string): string {
  return `${JSON.stringify(createSceneFile(scene, savedAtUtc), null, 2)}\n`;
}

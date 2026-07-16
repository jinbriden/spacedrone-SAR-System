import { create } from "zustand";
import {
  updateTargetPassState,
  buildCoverageUnion,
  unionCoverageGeometry,
  ecefToGeodetic,
  RAD_TO_DEG,
  WGS84_SEMI_MAJOR_AXIS_M,
  type TargetPassState,
  type AntennaGainPattern,
  type CoverageUnionGeometry,
  type Vector3,
  type TerrainHeightGrid,
} from "@spacedrone/orbital-core";

export interface CircularOrbitConfig {
  mode: "circular" | "keplerian" | "tle";
  propagationModel: "twoBody" | "j2Secular" | "sgp4";
  earthRotationEnabled: boolean;
  altitudeM: number;
  direction: 1 | -1;
  semiMajorAxisM: number;
  eccentricity: number;
  argumentOfPeriapsisDeg: number;
  anomalyType: "mean" | "true";
  initialAnomalyDeg: number;
  inclinationDeg: number;
  raanDeg: number;
  initialPhaseDeg: number;
  epochUtc: string;
  tleName: string;
  tleLine1: string;
  tleLine2: string;
}

export interface PickedLocation {
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeM: number;
}

export interface AttitudeConfig {
  mode: "fixed" | "external";
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
  sequence: AttitudeSequenceSample[];
  maxRollDeg: number;
  maxPitchDeg: number;
  maxYawDeg: number;
  maxAngularRateDegS: number;
  maxAngularAccelerationDegS2: number;
}

export interface AttitudeSequenceSample {
  timeSeconds: number;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface SteeringTableSample {
  timeSeconds: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface AntennaFeedConfig {
  id: string;
  name: string;
  enabled: boolean;
  offsetXM: number;
  offsetYM: number;
  offsetZM: number;
  steeringAzimuthOffsetDeg: number;
  steeringElevationOffsetDeg: number;
  beamwidthScale: number;
  relativePowerDb: number;
  color: string;
}

export interface AntennaConfig {
  name: string;
  taskMode: "generic" | "stripmap" | "spotlight" | "scanSar" | "tops";
  spotlightTargetId: string;
  scanSarElevationAnglesDeg: number[];
  scanSarBurstDurationSeconds: number;
  topsStartAzimuthDeg: number;
  topsEndAzimuthDeg: number;
  topsSweepDurationSeconds: number;
  mountOffsetXM: number;
  mountOffsetYM: number;
  mountOffsetZM: number;
  mountRollDeg: number;
  mountPitchDeg: number;
  mountYawDeg: number;
  beamType: "circular" | "rectangular" | "pattern";
  gainPattern: AntennaGainPattern | null;
  patternThresholdDbBelowPeak: number;
  steeringAzimuthDeg: number;
  steeringElevationDeg: number;
  circularBeamwidthDeg: number;
  azimuthBeamwidthDeg: number;
  elevationBeamwidthDeg: number;
  boundarySamples: number;
  maxDisplayDistanceM: number;
  scanMode: "fixed" | "sine" | "linear" | "custom";
  scanAxis: "azimuth" | "elevation";
  scanAmplitudeDeg: number;
  scanPeriodSeconds: number;
  scanPhaseDeg: number;
  steeringTable: SteeringTableSample[];
  maxScanAngleDeg: number;
  beamColor: string;
  beamOpacity: number;
  arrayFeeds: AntennaFeedConfig[];
}

export interface GroundTargetConfig {
  id: string;
  name: string;
  targetType: "point" | "circle" | "rectangle" | "polygon";
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeM: number;
  radiusM: number;
  widthM: number;
  heightM: number;
  vertices: Array<{ longitudeDeg: number; latitudeDeg: number }>;
}

export interface CompanionSatelliteConfig {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  orbit: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
}

export interface TargetDraft {
  name: string;
  targetType: GroundTargetConfig["targetType"];
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeM: number;
  radiusM: number;
  widthM: number;
  heightM: number;
  vertices: GroundTargetConfig["vertices"];
}

export interface CoverageHistorySample {
  timeSeconds: number;
  verticesEcefM: Vector3[];
  beamFootprints?: Array<{
    beamId: string;
    beamName: string;
    color: string;
    verticesEcefM: Vector3[];
  }>;
}

export interface MissionSettings {
  targetSampleStepSeconds: number;
  historyEnabled: boolean;
  historySampleIntervalSeconds: number;
  maxHistoryFootprints: number;
  historyDisplayMode: "footprints" | "union";
  revisitStartSeconds: number;
  revisitEndSeconds: number;
  revisitSampleStepSeconds: number;
  revisitTransitionToleranceSeconds: number;
  taskPlanStartSeconds: number;
  taskPlanEndSeconds: number;
  taskPlanSampleStepSeconds: number;
  taskPlanTransitionToleranceSeconds: number;
}

export interface MissionTaskConfig {
  targetId: string;
  enabled: boolean;
  priority: number;
  requiredDurationSeconds: number;
  earliestStartSeconds: number;
  latestEndSeconds: number;
  minimumSegmentSeconds: number;
  allowSplit: boolean;
}

export interface TimelineSettings {
  startSeconds: number;
  endSeconds: number;
}

export interface DisplaySettings {
  showEarthTexture: boolean;
  showGrid: boolean;
  showBorders: boolean;
  showEarthReferences: boolean;
  lightingEnabled: boolean;
  showOrbit: boolean;
  showGroundTrack: boolean;
  showAxes: boolean;
  showBeam: boolean;
  showFootprint: boolean;
  showTargets: boolean;
  showHistory: boolean;
  satelliteScale: number;
  satelliteModelUrl: string;
  cameraMode: "free" | "satellite" | "subpoint" | "beamCenter";
}

export interface TerrainConfig {
  enabled: boolean;
  grid: TerrainHeightGrid | null;
  fallbackToEllipsoid: boolean;
  rayToleranceM: number;
  lineOfSightEnabled: boolean;
  lineOfSightSampleSpacingM: number;
  lineOfSightClearanceM: number;
  color: string;
  opacity: number;
}

export interface SarConfig {
  targetId: string;
  analysisCenterSeconds: number;
  carrierFrequencyHz: number;
  chirpBandwidthHz: number;
  pulseWidthSeconds: number;
  prfHz: number;
  samplingRateHz: number;
  apertureDurationSeconds: number;
  fastTimeMarginSeconds: number;
  echoPulseCount: number;
  targetRcsM2: number;
  noiseStandardDeviation: number;
  randomSeed: number;
  foldRangeAmbiguity: boolean;
  receiveChannelCount: number;
  receiveChannelSpacingM: number;
  multiChannelPulseCount: number;
  dbfSteeringDopplerHz: number;
  imagingAlgorithmId: "reference-range-backprojection";
  imagingMaximumRangePixels: number;
}

export interface MissionSampleRecord {
  timeSeconds: number;
  targetInsideById: Record<string, boolean>;
  footprintVerticesEcefM?: Vector3[];
  beamFootprints?: CoverageHistorySample["beamFootprints"];
}

export interface SceneSnapshot {
  orbit: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
  targets: GroundTargetConfig[];
  missionSettings: MissionSettings;
  elapsedSeconds: number;
  playbackRate: number;
  targetPasses: Record<string, TargetPassState>;
  coverageHistory: CoverageHistorySample[];
  timelineSettings: TimelineSettings;
  displaySettings: DisplaySettings;
  companionSatellites?: CompanionSatelliteConfig[];
  taskRequirements?: Record<string, MissionTaskConfig>;
  terrain?: TerrainConfig;
  sar?: SarConfig;
}

interface SimulationStore {
  orbit: CircularOrbitConfig;
  orbitDraft: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
  companionSatellites: CompanionSatelliteConfig[];
  taskRequirements: Record<string, MissionTaskConfig>;
  terrain: TerrainConfig;
  sar: SarConfig;
  targets: GroundTargetConfig[];
  targetDraft: TargetDraft;
  targetPasses: Record<string, TargetPassState>;
  coverageHistory: CoverageHistorySample[];
  coverageUnion: CoverageUnionGeometry;
  missionSettings: MissionSettings;
  timelineSettings: TimelineSettings;
  displaySettings: DisplaySettings;
  cameraResetRevision: number;
  screenshotRevision: number;
  elapsedSeconds: number;
  playbackRate: number;
  playing: boolean;
  pickedLocation?: PickedLocation;
  sceneRevision: number;
  updateOrbitDraft: (patch: Partial<CircularOrbitConfig>) => void;
  updateAttitude: (patch: Partial<AttitudeConfig>) => void;
  updateAntenna: (patch: Partial<AntennaConfig>) => void;
  addCompanionSatellite: () => void;
  updateCompanionSatellite: (id: string, patch: Partial<CompanionSatelliteConfig>) => void;
  removeCompanionSatellite: (id: string) => void;
  updateTaskRequirement: (targetId: string, patch: Partial<MissionTaskConfig>) => void;
  updateTerrain: (patch: Partial<TerrainConfig>) => void;
  updateSar: (patch: Partial<SarConfig>) => void;
  updateTargetDraft: (patch: Partial<TargetDraft>) => void;
  addTargetFromDraft: () => void;
  addTargetAtPickedLocation: () => void;
  addTargets: (targets: GroundTargetConfig[]) => void;
  removeTarget: (id: string) => void;
  clearTargets: () => void;
  updateMissionSettings: (patch: Partial<MissionSettings>) => void;
  updateTimelineSettings: (patch: Partial<TimelineSettings>) => void;
  updateDisplaySettings: (patch: Partial<DisplaySettings>) => void;
  requestCameraReset: () => void;
  requestScreenshot: () => void;
  processMissionSamples: (samples: MissionSampleRecord[]) => void;
  resetMissionData: () => void;
  clearCoverageHistory: () => void;
  loadScene: (scene: SceneSnapshot) => void;
  newScene: () => void;
  applyOrbit: () => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (playbackRate: number) => void;
  setElapsedSeconds: (elapsedSeconds: number) => void;
  advanceByRealTime: (realDeltaSeconds: number) => void;
  step: (simulationDeltaSeconds: number) => void;
  reset: () => void;
  setPickedLocation: (location?: PickedLocation) => void;
}

export const defaultOrbit: CircularOrbitConfig = {
  mode: "circular",
  propagationModel: "twoBody",
  earthRotationEnabled: true,
  altitudeM: 500_000,
  direction: 1,
  semiMajorAxisM: WGS84_SEMI_MAJOR_AXIS_M + 500_000,
  eccentricity: 0,
  argumentOfPeriapsisDeg: 0,
  anomalyType: "mean",
  initialAnomalyDeg: 0,
  inclinationDeg: 97.4,
  raanDeg: 0,
  initialPhaseDeg: 0,
  epochUtc: "2026-07-15T00:00:00.000Z",
  tleName: "Vanguard 1 验证 TLE",
  tleLine1: "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
  tleLine2: "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667",
};

export const defaultAttitude: AttitudeConfig = {
  mode: "fixed",
  rollDeg: 0,
  pitchDeg: 0,
  yawDeg: 0,
  sequence: [],
  maxRollDeg: 180,
  maxPitchDeg: 180,
  maxYawDeg: 180,
  maxAngularRateDegS: 30,
  maxAngularAccelerationDegS2: 10,
};
export const defaultAntenna: AntennaConfig = {
  name: "ANT-1",
  taskMode: "generic",
  spotlightTargetId: "",
  scanSarElevationAnglesDeg: [-20, 0, 20],
  scanSarBurstDurationSeconds: 10,
  topsStartAzimuthDeg: -20,
  topsEndAzimuthDeg: 20,
  topsSweepDurationSeconds: 20,
  mountOffsetXM: 0,
  mountOffsetYM: 0,
  mountOffsetZM: 0,
  mountRollDeg: 0,
  mountPitchDeg: 0,
  mountYawDeg: 0,
  beamType: "circular",
  gainPattern: null,
  patternThresholdDbBelowPeak: 3,
  steeringAzimuthDeg: 0,
  steeringElevationDeg: 0,
  circularBeamwidthDeg: 6,
  azimuthBeamwidthDeg: 4,
  elevationBeamwidthDeg: 8,
  boundarySamples: 96,
  maxDisplayDistanceM: 1_500_000,
  scanMode: "fixed",
  scanAxis: "azimuth",
  scanAmplitudeDeg: 20,
  scanPeriodSeconds: 60,
  scanPhaseDeg: 0,
  steeringTable: [],
  maxScanAngleDeg: 60,
  beamColor: "#fadb14",
  beamOpacity: 0.2,
  arrayFeeds: [],
};

export const defaultTargetDraft: TargetDraft = {
  name: "目标 1",
  targetType: "point",
  longitudeDeg: 67.1379,
  latitudeDeg: 0,
  altitudeM: 0,
  radiusM: 50_000,
  widthM: 100_000,
  heightM: 80_000,
  vertices: [],
};

export const defaultMissionSettings: MissionSettings = {
  targetSampleStepSeconds: 1,
  historyEnabled: true,
  historySampleIntervalSeconds: 10,
  maxHistoryFootprints: 240,
  historyDisplayMode: "footprints",
  revisitStartSeconds: 0,
  revisitEndSeconds: 86_400,
  revisitSampleStepSeconds: 5,
  revisitTransitionToleranceSeconds: 0.1,
  taskPlanStartSeconds: 0,
  taskPlanEndSeconds: 86_400,
  taskPlanSampleStepSeconds: 10,
  taskPlanTransitionToleranceSeconds: 0.1,
};

export function createDefaultMissionTask(targetId: string): MissionTaskConfig {
  return {
    targetId, enabled: false, priority: 5, requiredDurationSeconds: 60,
    earliestStartSeconds: 0, latestEndSeconds: 86_400,
    minimumSegmentSeconds: 10, allowSplit: true,
  };
}

export const defaultTimelineSettings: TimelineSettings = {
  startSeconds: 0,
  endSeconds: 6000,
};

export const defaultDisplaySettings: DisplaySettings = {
  showEarthTexture: true,
  showGrid: true,
  showBorders: true,
  showEarthReferences: false,
  lightingEnabled: false,
  showOrbit: true,
  showGroundTrack: true,
  showAxes: true,
  showBeam: true,
  showFootprint: true,
  showTargets: true,
  showHistory: true,
  satelliteScale: 1,
  satelliteModelUrl: "",
  cameraMode: "free",
};

export const defaultTerrain: TerrainConfig = {
  enabled: false,
  grid: null,
  fallbackToEllipsoid: true,
  rayToleranceM: 0.1,
  lineOfSightEnabled: true,
  lineOfSightSampleSpacingM: 1000,
  lineOfSightClearanceM: 0,
  color: "#8c6a43",
  opacity: 0.55,
};

export const defaultSar: SarConfig = {
  targetId: "",
  analysisCenterSeconds: 10,
  carrierFrequencyHz: 9.65e9,
  chirpBandwidthHz: 300e6,
  pulseWidthSeconds: 20e-6,
  prfHz: 3000,
  samplingRateHz: 360e6,
  apertureDurationSeconds: 1,
  fastTimeMarginSeconds: 5e-6,
  echoPulseCount: 256,
  targetRcsM2: 1,
  noiseStandardDeviation: 0,
  randomSeed: 1,
  foldRangeAmbiguity: true,
  receiveChannelCount: 3,
  receiveChannelSpacingM: 1.5,
  multiChannelPulseCount: 64,
  dbfSteeringDopplerHz: 0,
  imagingAlgorithmId: "reference-range-backprojection",
  imagingMaximumRangePixels: 512,
};

function createTargetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `target-${Date.now()}-${Math.random()}`;
}

function cloneAttitudeConfig(attitude: AttitudeConfig): AttitudeConfig {
  return { ...attitude, sequence: attitude.sequence.map((sample) => ({ ...sample })) };
}

function cloneAntennaConfig(antenna: AntennaConfig): AntennaConfig {
  return {
    ...antenna,
    scanSarElevationAnglesDeg: [...antenna.scanSarElevationAnglesDeg],
    steeringTable: antenna.steeringTable.map((sample) => ({ ...sample })),
    gainPattern: antenna.gainPattern ? {
      ...antenna.gainPattern,
      azimuthAnglesDeg: [...antenna.gainPattern.azimuthAnglesDeg],
      elevationAnglesDeg: [...antenna.gainPattern.elevationAnglesDeg],
      gainDb: antenna.gainPattern.gainDb.map((row) => [...row]),
    } : null,
    arrayFeeds: antenna.arrayFeeds.map((feed) => ({ ...feed })),
  };
}

function cloneCompanionSatellite(satellite: CompanionSatelliteConfig): CompanionSatelliteConfig {
  return {
    ...satellite,
    orbit: { ...satellite.orbit },
    attitude: cloneAttitudeConfig(satellite.attitude),
    antenna: cloneAntennaConfig(satellite.antenna),
  };
}

function buildUnionFromHistory(history: readonly CoverageHistorySample[]): CoverageUnionGeometry {
  return buildCoverageUnion(history.flatMap((sample) =>
    (sample.beamFootprints?.length
      ? sample.beamFootprints.map((beam) => beam.verticesEcefM)
      : [sample.verticesEcefM]
    ).map(footprintToGeodetic),
  ));
}

function footprintToGeodetic(verticesEcefM: readonly Vector3[]) {
  return verticesEcefM.map((point) => {
    const geodetic = ecefToGeodetic(point);
    return { longitudeDeg: geodetic.longitudeRad * RAD_TO_DEG, latitudeDeg: geodetic.latitudeRad * RAD_TO_DEG };
  });
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  orbit: defaultOrbit,
  orbitDraft: defaultOrbit,
  attitude: defaultAttitude,
  antenna: defaultAntenna,
  companionSatellites: [],
  taskRequirements: {},
  terrain: defaultTerrain,
  sar: defaultSar,
  targets: [],
  targetDraft: defaultTargetDraft,
  targetPasses: {},
  coverageHistory: [],
  coverageUnion: [],
  missionSettings: defaultMissionSettings,
  timelineSettings: defaultTimelineSettings,
  displaySettings: defaultDisplaySettings,
  cameraResetRevision: 0,
  screenshotRevision: 0,
  elapsedSeconds: 0,
  playbackRate: 100,
  playing: false,
  sceneRevision: 0,
  updateOrbitDraft: (patch) =>
    set((state) => ({ orbitDraft: { ...state.orbitDraft, ...patch } })),
  updateAttitude: (patch) =>
    set((state) => ({ attitude: { ...state.attitude, ...patch } })),
  updateAntenna: (patch) =>
    set((state) => ({ antenna: { ...state.antenna, ...patch } })),
  addCompanionSatellite: () =>
    set((state) => {
      if (state.companionSatellites.length >= 31) return state;
      const index = state.companionSatellites.length + 2;
      const phaseOffsetDeg = 360 / (state.companionSatellites.length + 2);
      const orbit = {
        ...state.orbit,
        initialPhaseDeg: state.orbit.initialPhaseDeg + phaseOffsetDeg,
        initialAnomalyDeg: state.orbit.initialAnomalyDeg + phaseOffsetDeg,
      };
      const palette = ["#ff7875", "#95de64", "#b37feb", "#ffd666", "#5cdbd3", "#69c0ff"];
      return {
        companionSatellites: [...state.companionSatellites, {
          id: globalThis.crypto?.randomUUID?.() ?? `satellite-${Date.now()}-${Math.random()}`,
          name: `SAT-${index}`,
          color: palette[(index - 2) % palette.length],
          enabled: true,
          orbit,
          attitude: cloneAttitudeConfig(state.attitude),
          antenna: cloneAntennaConfig(state.antenna),
        }],
      };
    }),
  updateCompanionSatellite: (id, patch) =>
    set((state) => ({
      companionSatellites: state.companionSatellites.map((satellite) =>
        satellite.id === id ? cloneCompanionSatellite({ ...satellite, ...patch }) : satellite,
      ),
    })),
  removeCompanionSatellite: (id) =>
    set((state) => ({ companionSatellites: state.companionSatellites.filter((satellite) => satellite.id !== id) })),
  updateTaskRequirement: (targetId, patch) =>
    set((state) => ({
      taskRequirements: {
        ...state.taskRequirements,
        [targetId]: { ...(state.taskRequirements[targetId] ?? createDefaultMissionTask(targetId)), ...patch, targetId },
      },
    })),
  updateTerrain: (patch) => set((state) => ({ terrain: { ...state.terrain, ...patch } })),
  updateSar: (patch) => set((state) => ({ sar: { ...state.sar, ...patch } })),
  updateTargetDraft: (patch) =>
    set((state) => ({ targetDraft: { ...state.targetDraft, ...patch } })),
  addTargetFromDraft: () =>
    set((state) => {
      const target = { id: createTargetId(), ...state.targetDraft };
      return {
        targets: [...state.targets, target],
        targetDraft: {
          ...state.targetDraft,
          name: `目标 ${state.targets.length + 2}`,
        },
      };
    }),
  addTargetAtPickedLocation: () =>
    set((state) => {
      if (!state.pickedLocation) return state;
      const target: GroundTargetConfig = {
        id: createTargetId(),
        ...state.targetDraft,
        longitudeDeg: state.pickedLocation.longitudeDeg,
        latitudeDeg: state.pickedLocation.latitudeDeg,
        altitudeM: state.pickedLocation.altitudeM,
      };
      return {
        targets: [...state.targets, target],
        targetDraft: {
          ...state.targetDraft,
          name: `目标 ${state.targets.length + 2}`,
          longitudeDeg: target.longitudeDeg,
          latitudeDeg: target.latitudeDeg,
          altitudeM: target.altitudeM,
        },
      };
    }),
  addTargets: (targets) =>
    set((state) => {
      const usedIds = new Set(state.targets.map((target) => target.id));
      const imported = targets.map((target) => {
        let id = target.id;
        let suffix = 2;
        while (usedIds.has(id)) id = `${target.id}-${suffix++}`;
        usedIds.add(id);
        return { ...target, id };
      });
      return {
        targets: [...state.targets, ...imported],
        targetDraft: {
          ...state.targetDraft,
          name: `目标 ${state.targets.length + imported.length + 1}`,
        },
      };
    }),
  removeTarget: (id) =>
    set((state) => {
      const targetPasses = { ...state.targetPasses };
      const taskRequirements = { ...state.taskRequirements };
      delete targetPasses[id];
      delete taskRequirements[id];
      return {
        targets: state.targets.filter((target) => target.id !== id),
        targetPasses,
        taskRequirements,
        sar: state.sar.targetId === id ? { ...state.sar, targetId: "" } : state.sar,
      };
    }),
  clearTargets: () => set((state) => ({ targets: [], targetPasses: {}, taskRequirements: {}, sar: { ...state.sar, targetId: "" } })),
  updateMissionSettings: (patch) =>
    set((state) => {
      const missionSettings = { ...state.missionSettings, ...patch };
      return {
        missionSettings,
        coverageUnion: missionSettings.historyDisplayMode === "union"
          ? buildUnionFromHistory(state.coverageHistory)
          : state.coverageUnion,
      };
    }),
  updateTimelineSettings: (patch) =>
    set((state) => {
      const timelineSettings = { ...state.timelineSettings, ...patch };
      if (timelineSettings.startSeconds < 0 || timelineSettings.endSeconds <= timelineSettings.startSeconds) {
        return state;
      }
      return {
        timelineSettings,
        elapsedSeconds: Math.max(
          timelineSettings.startSeconds,
          Math.min(timelineSettings.endSeconds, state.elapsedSeconds),
        ),
      };
    }),
  updateDisplaySettings: (patch) =>
    set((state) => ({ displaySettings: { ...state.displaySettings, ...patch } })),
  requestCameraReset: () =>
    set((state) => ({
      displaySettings: { ...state.displaySettings, cameraMode: "free" },
      cameraResetRevision: state.cameraResetRevision + 1,
    })),
  requestScreenshot: () =>
    set((state) => ({ screenshotRevision: state.screenshotRevision + 1 })),
  processMissionSamples: (samples) =>
    set((state) => {
      if (samples.length === 0) return state;
      const targetPasses = { ...state.targetPasses };
      let coverageHistory = [...state.coverageHistory];
      let coverageUnion = state.coverageUnion;
      let unionNeedsRebuild = false;
      const targetIds = new Set(state.targets.map((target) => target.id));
      for (const sample of samples) {
        for (const [targetId, inside] of Object.entries(sample.targetInsideById)) {
          if (!targetIds.has(targetId)) continue;
          targetPasses[targetId] = updateTargetPassState(
            targetPasses[targetId],
            sample.timeSeconds,
            inside,
          );
        }
        if (sample.footprintVerticesEcefM) {
          const historySample = {
            timeSeconds: sample.timeSeconds,
            verticesEcefM: sample.footprintVerticesEcefM,
            beamFootprints: sample.beamFootprints,
          };
          if (
            coverageHistory.length > 0 &&
            Math.abs(coverageHistory[coverageHistory.length - 1].timeSeconds - sample.timeSeconds) < 1e-9
          ) {
            coverageHistory[coverageHistory.length - 1] = historySample;
            unionNeedsRebuild = true;
          } else {
            coverageHistory.push(historySample);
            if (state.missionSettings.historyDisplayMode === "union") {
              for (const vertices of historySample.beamFootprints?.map((beam) => beam.verticesEcefM) ?? [historySample.verticesEcefM]) {
                coverageUnion = unionCoverageGeometry(coverageUnion, footprintToGeodetic(vertices));
              }
            }
          }
        }
      }
      const maximum = state.missionSettings.maxHistoryFootprints;
      if (coverageHistory.length > maximum) {
        coverageHistory = coverageHistory.slice(coverageHistory.length - maximum);
        unionNeedsRebuild = true;
      }
      if (state.missionSettings.historyDisplayMode === "union" && unionNeedsRebuild) {
        coverageUnion = buildUnionFromHistory(coverageHistory);
      }
      return { targetPasses, coverageHistory, coverageUnion };
    }),
  resetMissionData: () => set({ targetPasses: {}, coverageHistory: [], coverageUnion: [] }),
  clearCoverageHistory: () => set({ coverageHistory: [], coverageUnion: [] }),
  loadScene: (scene) =>
    set({
      orbit: { ...scene.orbit },
      orbitDraft: { ...scene.orbit },
      attitude: { ...scene.attitude },
      antenna: cloneAntennaConfig(scene.antenna),
      companionSatellites: (scene.companionSatellites ?? []).map(cloneCompanionSatellite),
      taskRequirements: Object.fromEntries(Object.entries(scene.taskRequirements ?? {}).map(([id, task]) => [id, { ...task }])),
      terrain: { ...(scene.terrain ?? defaultTerrain), grid: scene.terrain?.grid ? { ...scene.terrain.grid, longitudeDeg: [...scene.terrain.grid.longitudeDeg], latitudeDeg: [...scene.terrain.grid.latitudeDeg], heightM: scene.terrain.grid.heightM.map((row) => [...row]) } : null },
      sar: { ...(scene.sar ?? defaultSar) },
      targets: scene.targets.map((target) => ({ ...target })),
      targetDraft: {
        ...defaultTargetDraft,
        name: `目标 ${scene.targets.length + 1}`,
      },
      missionSettings: { ...scene.missionSettings },
      timelineSettings: { ...scene.timelineSettings },
      displaySettings: { ...scene.displaySettings },
      elapsedSeconds: scene.elapsedSeconds,
      playbackRate: scene.playbackRate,
      playing: false,
      pickedLocation: undefined,
      targetPasses: Object.fromEntries(
        Object.entries(scene.targetPasses).map(([id, pass]) => [id, { ...pass }]),
      ),
      coverageHistory: scene.coverageHistory.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        verticesEcefM: sample.verticesEcefM.map((point) => [...point] as Vector3),
        beamFootprints: sample.beamFootprints?.map((beam) => ({
          ...beam,
          verticesEcefM: beam.verticesEcefM.map((point) => [...point] as Vector3),
        })),
      })),
      coverageUnion: scene.missionSettings.historyDisplayMode === "union"
        ? buildUnionFromHistory(scene.coverageHistory)
        : [],
      sceneRevision: useSimulationStore.getState().sceneRevision + 1,
    }),
  newScene: () =>
    set({
      orbit: { ...defaultOrbit },
      orbitDraft: { ...defaultOrbit },
      attitude: { ...defaultAttitude },
      antenna: cloneAntennaConfig(defaultAntenna),
      companionSatellites: [],
      taskRequirements: {},
      terrain: { ...defaultTerrain },
      sar: { ...defaultSar },
      targets: [],
      targetDraft: { ...defaultTargetDraft },
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { ...defaultTimelineSettings },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 100,
      playing: false,
      pickedLocation: undefined,
      targetPasses: {},
      coverageHistory: [],
      coverageUnion: [],
      sceneRevision: useSimulationStore.getState().sceneRevision + 1,
    }),
  applyOrbit: () =>
    set((state) => ({
      orbit: { ...state.orbitDraft },
      elapsedSeconds: state.timelineSettings.startSeconds,
      playing: false,
      targetPasses: {},
      coverageHistory: [],
      coverageUnion: [],
    })),
  setPlaying: (playing) => set({ playing }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setElapsedSeconds: (elapsedSeconds) =>
    set((state) => ({
      elapsedSeconds: Math.max(
        state.timelineSettings.startSeconds,
        Math.min(state.timelineSettings.endSeconds, elapsedSeconds),
      ),
      playing: false,
    })),
  advanceByRealTime: (realDeltaSeconds) =>
    set((state) =>
      state.playing && Number.isFinite(realDeltaSeconds) && realDeltaSeconds >= 0
        ? (() => {
            const elapsedSeconds = Math.min(
              state.timelineSettings.endSeconds,
              state.elapsedSeconds + realDeltaSeconds * state.playbackRate,
            );
            return {
              elapsedSeconds,
              playing: elapsedSeconds < state.timelineSettings.endSeconds,
            };
          })()
        : state,
    ),
  step: (simulationDeltaSeconds) =>
    set((state) => ({
      elapsedSeconds: Math.max(
        state.timelineSettings.startSeconds,
        Math.min(state.timelineSettings.endSeconds, state.elapsedSeconds + simulationDeltaSeconds),
      ),
    })),
  reset: () =>
    set({
      elapsedSeconds: useSimulationStore.getState().timelineSettings.startSeconds,
      playing: false,
      targetPasses: {},
      coverageHistory: [],
      coverageUnion: [],
    }),
  setPickedLocation: (pickedLocation) => set({ pickedLocation }),
}));

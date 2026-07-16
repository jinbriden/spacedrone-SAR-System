import {
  angularDirectionAntenna,
  add,
  bodyDirectionToLvlh,
  bodyFromAntennaMatrix,
  bodyFromLvlhMatrix,
  buildLvlhFrame,
  computeBeamFootprint,
  createAttitudeLaw,
  createBeamSteeringLaw,
  createScanSarSteeringLaw,
  createTopsSteeringLaw,
  DEG_TO_RAD,
  ecefToGeodetic,
  geodeticToEcef,
  intersectRayTerrain,
  eciStateToEcef,
  eciVectorToEcef,
  frameVectorToParent,
  magnitude,
  matrixFromColumns,
  multiplyMatrices,
  multiplyMatrixVector,
  normalize,
  RAD_TO_DEG,
  sampleCircularBeamBoundary,
  sampleRectangularBeamBoundary,
  samplePatternGainBoundary,
  subtract,
  transposeMatrix,
  directionToAngularCoordinatesAntenna,
  type Vector3,
} from "@spacedrone/orbital-core";
import { createConfiguredOrbitPropagator } from "./orbitFactory";
import type {
  AntennaConfig,
  AttitudeConfig,
  CircularOrbitConfig,
  GroundTargetConfig,
  TerrainConfig,
} from "../stores/simulationStore";

const UNIT_AXES: readonly Vector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export interface SceneGeometryInput {
  orbit: CircularOrbitConfig;
  attitude: AttitudeConfig;
  antenna: AntennaConfig;
  targets?: readonly GroundTargetConfig[];
  terrain?: TerrainConfig;
  elapsedSeconds: number;
  simulationDateUtc?: Date;
}

/** Pure, render-independent geometry calculation for one simulation instant. */
export function computeSceneGeometry(input: SceneGeometryInput) {
  const { orbit, attitude, antenna, elapsedSeconds } = input;
  const propagator = createConfiguredOrbitPropagator(orbit);
  const orbitEpochMs = new Date(orbit.epochUtc).getTime();
  const dateUtc = input.simulationDateUtc ?? new Date(orbitEpochMs + elapsedSeconds * 1000);
  const propagationSeconds = (dateUtc.getTime() - orbitEpochMs) / 1000;
  const earthRotationDateUtc = orbit.earthRotationEnabled ? dateUtc : new Date(orbit.epochUtc);
  const stateEci = propagator.propagate(propagationSeconds);
  const stateEcef = orbit.earthRotationEnabled
    ? eciStateToEcef(
        { positionM: stateEci.positionEciM, velocityMps: stateEci.velocityEciMps },
        earthRotationDateUtc,
      )
    : {
        positionM: eciVectorToEcef(stateEci.positionEciM, earthRotationDateUtc),
        velocityMps: eciVectorToEcef(stateEci.velocityEciMps, earthRotationDateUtc),
      };
  const geodetic = ecefToGeodetic(stateEcef.positionM);
  const satellite = {
    propagator,
    dateUtc,
    elapsedSeconds,
    positionEciM: stateEci.positionEciM,
    velocityEciMps: stateEci.velocityEciMps,
    positionEcefM: stateEcef.positionM,
    velocityEcefMps: stateEcef.velocityMps,
    speedMps: magnitude(stateEci.velocityEciMps),
    longitudeDeg: geodetic.longitudeRad * RAD_TO_DEG,
    latitudeDeg: geodetic.latitudeRad * RAD_TO_DEG,
    altitudeM: geodetic.altitudeM,
  };

  const lvlhEci = buildLvlhFrame(stateEci.positionEciM, stateEci.velocityEciMps);
  const effectiveEulerRad = createAttitudeLaw({
    mode: attitude.mode,
    fixed: {
      rollRad: attitude.rollDeg * DEG_TO_RAD,
      pitchRad: attitude.pitchDeg * DEG_TO_RAD,
      yawRad: attitude.yawDeg * DEG_TO_RAD,
    },
    samples: attitude.sequence.map((sample) => ({
      timeSeconds: sample.timeSeconds,
      rollRad: sample.rollDeg * DEG_TO_RAD,
      pitchRad: sample.pitchDeg * DEG_TO_RAD,
      yawRad: sample.yawDeg * DEG_TO_RAD,
    })),
  }).getAttitude(elapsedSeconds);
  const bodyFromLvlh = bodyFromLvlhMatrix(effectiveEulerRad);
  const bodyFromAntenna = bodyFromAntennaMatrix({
    rollRad: antenna.mountRollDeg * DEG_TO_RAD,
    pitchRad: antenna.mountPitchDeg * DEG_TO_RAD,
    yawRad: antenna.mountYawDeg * DEG_TO_RAD,
  });
  const lvlhDirectionToEcef = (directionLvlh: Vector3): Vector3 =>
    eciVectorToEcef(frameVectorToParent(lvlhEci, directionLvlh), earthRotationDateUtc);
  const lvlhAxesEcef = UNIT_AXES.map(lvlhDirectionToEcef) as [
    Vector3,
    Vector3,
    Vector3,
  ];
  const bodyAxesEcef = UNIT_AXES.map((axis) =>
    lvlhDirectionToEcef(bodyDirectionToLvlh(axis, bodyFromLvlh)),
  ) as [Vector3, Vector3, Vector3];
  const ecefFromLvlh = matrixFromColumns(...lvlhAxesEcef);
  const ecefFromBody = multiplyMatrices(
    ecefFromLvlh,
    transposeMatrix(bodyFromLvlh),
  );
  const ecefFromAntenna = multiplyMatrices(
    ecefFromBody,
    bodyFromAntenna,
  );
  const antennaPositionEcefM = add(
    stateEcef.positionM,
    multiplyMatrixVector(ecefFromBody, [
      antenna.mountOffsetXM,
      antenna.mountOffsetYM,
      antenna.mountOffsetZM,
    ]),
  );
  const fixedSteering = {
    azimuthRad: antenna.steeringAzimuthDeg * DEG_TO_RAD,
    elevationRad: antenna.steeringElevationDeg * DEG_TO_RAD,
  };
  let requestedSteering = fixedSteering;
  let taskModeWarning: string | undefined;
  if (antenna.taskMode === "generic") {
    requestedSteering = createBeamSteeringLaw({
      mode: antenna.scanMode,
      axis: antenna.scanAxis,
      baseAzimuthRad: fixedSteering.azimuthRad,
      baseElevationRad: fixedSteering.elevationRad,
      amplitudeRad: antenna.scanAmplitudeDeg * DEG_TO_RAD,
      periodSeconds: antenna.scanPeriodSeconds,
      phaseRad: antenna.scanPhaseDeg * DEG_TO_RAD,
      tableSamples: antenna.steeringTable.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        azimuthRad: sample.azimuthDeg * DEG_TO_RAD,
        elevationRad: sample.elevationDeg * DEG_TO_RAD,
      })),
    }).getSteeringAngles(elapsedSeconds);
  } else if (antenna.taskMode === "scanSar") {
    requestedSteering = createScanSarSteeringLaw({
      azimuthRad: fixedSteering.azimuthRad,
      elevationAnglesRad: antenna.scanSarElevationAnglesDeg.map((angle) => angle * DEG_TO_RAD),
      burstDurationSeconds: antenna.scanSarBurstDurationSeconds,
    }).getSteeringAngles(elapsedSeconds);
  } else if (antenna.taskMode === "tops") {
    requestedSteering = createTopsSteeringLaw({
      startAzimuthRad: antenna.topsStartAzimuthDeg * DEG_TO_RAD,
      endAzimuthRad: antenna.topsEndAzimuthDeg * DEG_TO_RAD,
      elevationRad: fixedSteering.elevationRad,
      sweepDurationSeconds: antenna.topsSweepDurationSeconds,
    }).getSteeringAngles(elapsedSeconds);
  } else if (antenna.taskMode === "spotlight") {
    const target = input.targets?.find((candidate) => candidate.id === antenna.spotlightTargetId);
    if (!target) {
      taskModeWarning = "Spotlight 未找到所选目标，已回退到手动固定指向。请在目标面板添加并选择目标。";
    } else {
      const targetEcefM = geodeticToEcef({
        longitudeRad: target.longitudeDeg * DEG_TO_RAD,
        latitudeRad: target.latitudeDeg * DEG_TO_RAD,
        altitudeM: target.altitudeM,
      });
      const targetDirectionEcef = normalize(subtract(targetEcefM, antennaPositionEcefM));
      const targetDirectionAntenna = multiplyMatrixVector(transposeMatrix(ecefFromAntenna), targetDirectionEcef);
      try {
        requestedSteering = directionToAngularCoordinatesAntenna(targetDirectionAntenna);
      } catch (error) {
        taskModeWarning = `${error instanceof Error ? error.message : "Spotlight 指向计算失败。"} 已回退到手动固定指向。`;
      }
    }
  }
  const maxScanRad = antenna.maxScanAngleDeg * DEG_TO_RAD;
  const effectiveSteering = {
    azimuthRad: Math.max(-maxScanRad, Math.min(maxScanRad, requestedSteering.azimuthRad)),
    elevationRad: Math.max(-maxScanRad, Math.min(maxScanRad, requestedSteering.elevationRad)),
  };
  const centerDirectionAntenna = angularDirectionAntenna(
    effectiveSteering.azimuthRad,
    effectiveSteering.elevationRad,
  );
  const centerDirectionEcef = multiplyMatrixVector(
    ecefFromAntenna,
    centerDirectionAntenna,
  );
  const beamAxisLvlh = multiplyMatrixVector(
    multiplyMatrices(transposeMatrix(bodyFromLvlh), bodyFromAntenna),
    centerDirectionAntenna,
  );
  let patternBoundary: ReturnType<typeof samplePatternGainBoundary> | undefined;
  let beamPatternWarning: string | undefined;
  const boundaryAntenna = antenna.beamType === "circular"
    ? sampleCircularBeamBoundary({
          steeringAzimuthRad: effectiveSteering.azimuthRad,
          steeringElevationRad: effectiveSteering.elevationRad,
          fullBeamwidthRad: antenna.circularBeamwidthDeg * DEG_TO_RAD,
          sampleCount: antenna.boundarySamples,
        })
    : antenna.beamType === "rectangular"
      ? sampleRectangularBeamBoundary({
          steeringAzimuthRad: effectiveSteering.azimuthRad,
          steeringElevationRad: effectiveSteering.elevationRad,
          azimuthFullBeamwidthRad: antenna.azimuthBeamwidthDeg * DEG_TO_RAD,
          elevationFullBeamwidthRad: antenna.elevationBeamwidthDeg * DEG_TO_RAD,
          sampleCount: antenna.boundarySamples,
        })
      : antenna.gainPattern
        ? (patternBoundary = samplePatternGainBoundary({
            pattern: antenna.gainPattern,
            thresholdDbBelowPeak: antenna.patternThresholdDbBelowPeak,
            steeringAzimuthRad: effectiveSteering.azimuthRad,
            steeringElevationRad: effectiveSteering.elevationRad,
            sampleCount: antenna.boundarySamples,
          })).directions
        : (() => {
            beamPatternWarning = "二维方向图数据为空，暂以圆锥波束显示。请重新导入方向图。";
            return sampleCircularBeamBoundary({
              steeringAzimuthRad: effectiveSteering.azimuthRad,
              steeringElevationRad: effectiveSteering.elevationRad,
              fullBeamwidthRad: antenna.circularBeamwidthDeg * DEG_TO_RAD,
              sampleCount: antenna.boundarySamples,
            });
          })();
  if (patternBoundary?.clippedByPatternDomain) {
    beamPatternWarning = `相对峰值 -${antenna.patternThresholdDbBelowPeak.toFixed(2)} dB 主瓣到达方向图网格边缘，当前覆盖区被导入角域截断。`;
  }
  const boundaryDirectionsEcef = boundaryAntenna.map((direction) =>
    multiplyMatrixVector(ecefFromAntenna, direction),
  );
  let terrainIntersectionCount = 0;
  let terrainFallbackCount = 0;
  const terrain = input.terrain;
  const surfaceIntersector = terrain?.enabled && terrain.grid
    ? (originEcefM: Vector3, directionEcef: Vector3) => {
        const intersection = intersectRayTerrain(originEcefM, directionEcef, terrain.grid!, {
          toleranceM: terrain.rayToleranceM,
          fallbackToEllipsoid: terrain.fallbackToEllipsoid,
        });
        if (intersection?.usedTerrain) terrainIntersectionCount += 1;
        else if (intersection) terrainFallbackCount += 1;
        return intersection;
      }
    : undefined;
  const footprint = computeBeamFootprint({
    originEcefM: antennaPositionEcefM,
    centerDirectionEcef,
    boundaryDirectionsEcef,
    alongTrackAxisEcef: lvlhAxesEcef[0],
    crossTrackAxisEcef: lvlhAxesEcef[1],
    intersectRay: surfaceIntersector,
  });
  const primaryBeam = {
    id: "primary",
    name: antenna.name,
    isPrimary: true,
    color: antenna.beamColor,
    relativePowerDb: 0,
    feedOffsetAntennaM: [0, 0, 0] as Vector3,
    ...footprint,
    centerDirectionAntenna,
    centerDirectionEcef,
    boundaryDirectionsEcef,
    effectiveSteering,
    requestedSteering,
    originEcefM: antennaPositionEcefM,
    beamPatternWarning,
    patternPeakGainDb: patternBoundary?.peak.gainDb,
    patternThresholdGainDb: patternBoundary?.thresholdGainDb,
  };
  const additionalBeams = antenna.arrayFeeds.filter((feed) => feed.enabled).map((feed) => {
    const feedRequestedSteering = {
      azimuthRad: requestedSteering.azimuthRad + feed.steeringAzimuthOffsetDeg * DEG_TO_RAD,
      elevationRad: requestedSteering.elevationRad + feed.steeringElevationOffsetDeg * DEG_TO_RAD,
    };
    const feedEffectiveSteering = {
      azimuthRad: Math.max(-maxScanRad, Math.min(maxScanRad, feedRequestedSteering.azimuthRad)),
      elevationRad: Math.max(-maxScanRad, Math.min(maxScanRad, feedRequestedSteering.elevationRad)),
    };
    const feedCenterDirectionAntenna = angularDirectionAntenna(
      feedEffectiveSteering.azimuthRad,
      feedEffectiveSteering.elevationRad,
    );
    const feedCenterDirectionEcef = multiplyMatrixVector(ecefFromAntenna, feedCenterDirectionAntenna);
    let feedPatternBoundary: ReturnType<typeof samplePatternGainBoundary> | undefined;
    let feedPatternWarning: string | undefined;
    const feedBoundaryAntenna = antenna.beamType === "circular"
      ? sampleCircularBeamBoundary({
          steeringAzimuthRad: feedEffectiveSteering.azimuthRad,
          steeringElevationRad: feedEffectiveSteering.elevationRad,
          fullBeamwidthRad: Math.min(179, antenna.circularBeamwidthDeg * feed.beamwidthScale) * DEG_TO_RAD,
          sampleCount: antenna.boundarySamples,
        })
      : antenna.beamType === "rectangular"
        ? sampleRectangularBeamBoundary({
            steeringAzimuthRad: feedEffectiveSteering.azimuthRad,
            steeringElevationRad: feedEffectiveSteering.elevationRad,
            azimuthFullBeamwidthRad: Math.min(179, antenna.azimuthBeamwidthDeg * feed.beamwidthScale) * DEG_TO_RAD,
            elevationFullBeamwidthRad: Math.min(179, antenna.elevationBeamwidthDeg * feed.beamwidthScale) * DEG_TO_RAD,
            sampleCount: antenna.boundarySamples,
          })
        : antenna.gainPattern
          ? (feedPatternBoundary = samplePatternGainBoundary({
              pattern: antenna.gainPattern,
              thresholdDbBelowPeak: antenna.patternThresholdDbBelowPeak,
              steeringAzimuthRad: feedEffectiveSteering.azimuthRad,
              steeringElevationRad: feedEffectiveSteering.elevationRad,
              sampleCount: antenna.boundarySamples,
              angularScale: feed.beamwidthScale,
            })).directions
          : sampleCircularBeamBoundary({
              steeringAzimuthRad: feedEffectiveSteering.azimuthRad,
              steeringElevationRad: feedEffectiveSteering.elevationRad,
              fullBeamwidthRad: Math.min(179, antenna.circularBeamwidthDeg * feed.beamwidthScale) * DEG_TO_RAD,
              sampleCount: antenna.boundarySamples,
            });
    if (feedPatternBoundary?.clippedByPatternDomain) {
      feedPatternWarning = `馈源“${feed.name}”的方向图门限边界被导入角域截断。`;
    }
    const feedBoundaryDirectionsEcef = feedBoundaryAntenna.map((direction) =>
      multiplyMatrixVector(ecefFromAntenna, direction),
    );
    const feedOffsetAntennaM: Vector3 = [feed.offsetXM, feed.offsetYM, feed.offsetZM];
    const feedOriginEcefM = add(
      antennaPositionEcefM,
      multiplyMatrixVector(ecefFromAntenna, feedOffsetAntennaM),
    );
    const feedFootprint = computeBeamFootprint({
      originEcefM: feedOriginEcefM,
      centerDirectionEcef: feedCenterDirectionEcef,
      boundaryDirectionsEcef: feedBoundaryDirectionsEcef,
      alongTrackAxisEcef: lvlhAxesEcef[0],
      crossTrackAxisEcef: lvlhAxesEcef[1],
      intersectRay: surfaceIntersector,
    });
    return {
      id: feed.id,
      name: feed.name,
      isPrimary: false,
      color: feed.color,
      relativePowerDb: feed.relativePowerDb,
      feedOffsetAntennaM,
      ...feedFootprint,
      centerDirectionAntenna: feedCenterDirectionAntenna,
      centerDirectionEcef: feedCenterDirectionEcef,
      boundaryDirectionsEcef: feedBoundaryDirectionsEcef,
      effectiveSteering: feedEffectiveSteering,
      requestedSteering: feedRequestedSteering,
      originEcefM: feedOriginEcefM,
      beamPatternWarning: feedPatternWarning,
      patternPeakGainDb: feedPatternBoundary?.peak.gainDb,
      patternThresholdGainDb: feedPatternBoundary?.thresholdGainDb,
    };
  });
  const beams = [primaryBeam, ...additionalBeams];
  const terrainWarning = terrain?.enabled && terrain.grid && terrainFallbackCount > 0
    ? terrainFallbackCount + " 条波束射线落在 DEM 范围外，" + (terrain.fallbackToEllipsoid ? "已回退到 WGS84 椭球面。" : "未生成交点。")
    : undefined;

  return {
    satellite,
    attitude: {
      bodyFromLvlh,
      effectiveEulerRad,
      bodyFromAntenna,
      lvlhAxesEcef,
      bodyAxesEcef,
      beamAxisLvlh,
      beamAxisEcef: centerDirectionEcef,
      centerDirectionAntenna,
      ecefFromAntenna,
      effectiveSteering,
      requestedSteering,
      antennaPositionEcefM,
      taskModeWarning,
      beamPatternWarning,
      patternPeakGainDb: patternBoundary?.peak.gainDb,
      patternThresholdGainDb: patternBoundary?.thresholdGainDb,
    },
    coverage: {
      ...primaryBeam,
      taskModeWarning,
      terrainIntersectionCount,
      terrainFallbackCount,
      terrainWarning,
    },
    beams,
  };
}

export type SceneGeometry = ReturnType<typeof computeSceneGeometry>;

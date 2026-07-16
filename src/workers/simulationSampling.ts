import {
  RAD_TO_DEG,
  DEG_TO_RAD,
  bodyFromLvlhQuaternion,
  createAttitudeLaw,
  ecefToGeodetic,
  eciToEcef,
  type Vector3,
  type Quaternion,
} from "@spacedrone/orbital-core";
import { computeSceneGeometry } from "../simulation/sceneGeometry";
import { createConfiguredOrbitPropagator } from "../simulation/orbitFactory";
import type {
  AntennaConfig,
  AttitudeConfig,
  CircularOrbitConfig,
  GroundTargetConfig,
  TerrainConfig,
} from "../stores/simulationStore";

export interface SimulationSamplingRequest {
  orbit: CircularOrbitConfig;
  sampleCount: number;
  startSeconds?: number;
  endSeconds?: number;
  includeCoverage?: boolean;
  attitude?: AttitudeConfig;
  antenna?: AntennaConfig;
  targets?: GroundTargetConfig[];
  terrain?: TerrainConfig;
}

export interface GeodeticDegrees {
  longitudeDeg: number;
  latitudeDeg: number;
  altitudeM: number;
}

export interface SimulationSample {
  timeSeconds: number;
  utc: string;
  orbitPositionEcefAtEpochM: Vector3;
  positionEciM: Vector3;
  velocityEciMps: Vector3;
  satellitePositionEcefM: Vector3;
  attitudeQuaternion: Quaternion;
  satellite: GeodeticDegrees;
  beamCenter?: GeodeticDegrees;
  coverageVertices?: GeodeticDegrees[];
  coverageAreaM2?: number;
  slantRangeM?: number;
  incidenceAngleDeg?: number;
  footprintGeoJson?: {
    type: "Polygon";
    coordinates: number[][][];
  };
  beams?: Array<{
    beamId: string;
    beamName: string;
    color: string;
    relativePowerDb: number;
    center?: GeodeticDegrees;
    vertices?: GeodeticDegrees[];
    localProjectedAreaM2?: number;
    slantRangeM?: number;
    incidenceAngleDeg?: number;
  }>;
}

export interface SimulationSamplingResult {
  periodSeconds: number;
  samples: SimulationSample[];
}

function toDegrees(point: ReturnType<typeof ecefToGeodetic>): GeodeticDegrees {
  return {
    longitudeDeg: point.longitudeRad * RAD_TO_DEG,
    latitudeDeg: point.latitudeRad * RAD_TO_DEG,
    altitudeM: point.altitudeM,
  };
}

/** Samples at fixed simulation times. At most 10000 points are accepted per job. */
export function computeSimulationSamples(
  request: SimulationSamplingRequest,
): SimulationSamplingResult {
  if (!Number.isInteger(request.sampleCount) || request.sampleCount < 2) {
    throw new RangeError("采样点数量必须是至少为 2 的整数。");
  }
  if (request.sampleCount > 10_000) {
    throw new RangeError("单次采样最多 10000 点。请增大采样步长或缩短时间范围。");
  }
  if (request.includeCoverage && (!request.attitude || !request.antenna)) {
    throw new Error("覆盖区采样需要姿态和天线配置。");
  }

  const propagator = createConfiguredOrbitPropagator(request.orbit);
  const startSeconds = request.startSeconds ?? 0;
  const endSeconds = request.endSeconds ?? propagator.periodSeconds;
  if (!Number.isFinite(startSeconds) || startSeconds < 0) {
    throw new RangeError("采样起始时间必须是非负有限秒数。");
  }
  if (!Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    throw new RangeError("采样结束时间必须晚于起始时间。");
  }
  const epoch = new Date(request.orbit.epochUtc);
  if (!Number.isFinite(epoch.getTime())) throw new Error("轨道历元不是有效 UTC 时间。");

  const samples: SimulationSample[] = [];
  for (let index = 0; index < request.sampleCount; index += 1) {
    const fraction = index / (request.sampleCount - 1);
    const timeSeconds = startSeconds + fraction * (endSeconds - startSeconds);
    const state = propagator.propagate(timeSeconds);
    const date = new Date(epoch.getTime() + timeSeconds * 1000);
    const satellitePositionEcefM = eciToEcef(
      state.positionEciM,
      request.orbit.earthRotationEnabled ? date : epoch,
    );
    const effectiveAttitude = request.attitude
      ? createAttitudeLaw({
          mode: request.attitude.mode,
          fixed: {
            rollRad: request.attitude.rollDeg * DEG_TO_RAD,
            pitchRad: request.attitude.pitchDeg * DEG_TO_RAD,
            yawRad: request.attitude.yawDeg * DEG_TO_RAD,
          },
          samples: request.attitude.sequence.map((attitudeSample) => ({
            timeSeconds: attitudeSample.timeSeconds,
            rollRad: attitudeSample.rollDeg * DEG_TO_RAD,
            pitchRad: attitudeSample.pitchDeg * DEG_TO_RAD,
            yawRad: attitudeSample.yawDeg * DEG_TO_RAD,
          })),
        }).getAttitude(timeSeconds)
      : { rollRad: 0, pitchRad: 0, yawRad: 0 };
    const sample: SimulationSample = {
      timeSeconds,
      utc: date.toISOString(),
      orbitPositionEcefAtEpochM: eciToEcef(state.positionEciM, epoch),
      positionEciM: state.positionEciM,
      velocityEciMps: state.velocityEciMps,
      satellitePositionEcefM,
      attitudeQuaternion: bodyFromLvlhQuaternion(effectiveAttitude),
      satellite: toDegrees(ecefToGeodetic(satellitePositionEcefM)),
    };
    if (request.includeCoverage && request.attitude && request.antenna) {
      const scene = computeSceneGeometry({
        orbit: request.orbit,
        attitude: request.attitude,
        antenna: request.antenna,
        targets: request.targets,
        terrain: request.terrain,
        elapsedSeconds: timeSeconds,
      });
      sample.beams = scene.beams.map((beam) => ({
        beamId: beam.id,
        beamName: beam.name,
        color: beam.color,
        relativePowerDb: beam.relativePowerDb,
        center: beam.centerGeodetic ? toDegrees(beam.centerGeodetic) : undefined,
        vertices: beam.isClosed ? beam.vertices.map((vertex) => toDegrees(vertex.geodetic)) : undefined,
        localProjectedAreaM2: beam.localProjectedAreaM2,
        slantRangeM: beam.centerIntersection?.distanceM,
        incidenceAngleDeg: beam.incidenceAngleRad === undefined ? undefined : beam.incidenceAngleRad * RAD_TO_DEG,
      }));
      if (scene.coverage.centerGeodetic) {
        sample.beamCenter = toDegrees(scene.coverage.centerGeodetic);
      }
      sample.slantRangeM = scene.coverage.centerIntersection?.distanceM;
      sample.incidenceAngleDeg = scene.coverage.incidenceAngleRad === undefined
        ? undefined
        : scene.coverage.incidenceAngleRad * RAD_TO_DEG;
      if (scene.coverage.isClosed) {
        sample.coverageVertices = scene.coverage.vertices.map((vertex) =>
          toDegrees(vertex.geodetic),
        );
        sample.coverageAreaM2 = scene.coverage.localProjectedAreaM2;
        const ring = sample.coverageVertices.map((point) => [
          point.longitudeDeg,
          point.latitudeDeg,
          point.altitudeM,
        ]);
        ring.push([...ring[0]]);
        sample.footprintGeoJson = { type: "Polygon", coordinates: [ring] };
      }
    }
    samples.push(sample);
  }
  return { periodSeconds: propagator.periodSeconds, samples };
}

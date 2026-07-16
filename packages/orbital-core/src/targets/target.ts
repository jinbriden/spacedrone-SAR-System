import {
  WGS84_SEMI_MAJOR_AXIS_M,
  WGS84_SEMI_MINOR_AXIS_M,
} from "../constants";
import type { BeamFootprintResult } from "../coverage/footprint";
import { dot, magnitude, normalize, subtract } from "../math/vector";
import { multiplyMatrixVector, transposeMatrix } from "../math/matrix3";
import type { Matrix3, Vector3 } from "../types";

export interface TargetObservation {
  visibleAboveHorizon: boolean;
  insideFootprint: boolean;
  slantRangeM: number;
  incidenceAngleRad: number;
  azimuthInAntennaRad: number;
  elevationInAntennaRad: number;
  azimuthDeviationRad: number;
  elevationDeviationRad: number;
}

function surfaceNormalWgs84(pointEcefM: Vector3): Vector3 {
  return normalize([
    pointEcefM[0] / WGS84_SEMI_MAJOR_AXIS_M ** 2,
    pointEcefM[1] / WGS84_SEMI_MAJOR_AXIS_M ** 2,
    pointEcefM[2] / WGS84_SEMI_MINOR_AXIS_M ** 2,
  ]);
}

function pointOnSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): boolean {
  const crossValue =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  const scale = Math.max(1, Math.hypot(end[0] - start[0], end[1] - start[1]));
  if (Math.abs(crossValue) > 1e-8 * scale) return false;
  const projection =
    (point[0] - start[0]) * (end[0] - start[0]) +
    (point[1] - start[1]) * (end[1] - start[1]);
  const lengthSquared = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  return projection >= -1e-6 && projection <= lengthSquared + 1e-6;
}

/** Ray casting in a local tangent projection; boundary points count as inside. */
export function pointInProjectedFootprint(
  pointEcefM: Vector3,
  footprint: BeamFootprintResult,
  alongTrackAxisEcef: Vector3,
  crossTrackAxisEcef: Vector3,
): boolean {
  if (!footprint.isClosed || !footprint.centerIntersection || footprint.vertices.length < 3) {
    return false;
  }
  const origin = footprint.centerIntersection.pointEcefM;
  const along = normalize(alongTrackAxisEcef);
  const across = normalize(crossTrackAxisEcef);
  const project = (point: Vector3): [number, number] => {
    const delta = subtract(point, origin);
    return [dot(delta, along), dot(delta, across)];
  };
  const point = project(pointEcefM);
  const polygon = footprint.vertices.map((vertex) => project(vertex.pointEcefM));
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const start = polygon[previous];
    const end = polygon[index];
    if (pointOnSegment(point, start, end)) return true;
    const crossesRay =
      (end[1] > point[1]) !== (start[1] > point[1]) &&
      point[0] <
        ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0];
    if (crossesRay) inside = !inside;
  }
  return inside;
}

export interface EvaluateTargetOptions {
  targetEcefM: Vector3;
  satelliteEcefM: Vector3;
  footprint: BeamFootprintResult;
  alongTrackAxisEcef: Vector3;
  crossTrackAxisEcef: Vector3;
  ecefFromAntenna: Matrix3;
  steeringAzimuthRad: number;
  steeringElevationRad: number;
}

export function evaluateGroundTarget(options: EvaluateTargetOptions): TargetObservation {
  const targetToSatellite = subtract(options.satelliteEcefM, options.targetEcefM);
  const slantRangeM = magnitude(targetToSatellite);
  const targetNormal = surfaceNormalWgs84(options.targetEcefM);
  const directionToSatellite = normalize(targetToSatellite);
  const visibleAboveHorizon = dot(targetNormal, directionToSatellite) > 0;
  const satelliteToTargetEcef = normalize(subtract(options.targetEcefM, options.satelliteEcefM));
  const targetDirectionAntenna = multiplyMatrixVector(
    transposeMatrix(options.ecefFromAntenna),
    satelliteToTargetEcef,
  );
  const azimuthInAntennaRad = Math.atan2(
    targetDirectionAntenna[0],
    targetDirectionAntenna[2],
  );
  const elevationInAntennaRad = Math.atan2(
    targetDirectionAntenna[1],
    targetDirectionAntenna[2],
  );
  return {
    visibleAboveHorizon,
    insideFootprint:
      visibleAboveHorizon &&
      pointInProjectedFootprint(
        options.targetEcefM,
        options.footprint,
        options.alongTrackAxisEcef,
        options.crossTrackAxisEcef,
      ),
    slantRangeM,
    incidenceAngleRad: Math.atan2(
      magnitude([
        targetNormal[1] * directionToSatellite[2] - targetNormal[2] * directionToSatellite[1],
        targetNormal[2] * directionToSatellite[0] - targetNormal[0] * directionToSatellite[2],
        targetNormal[0] * directionToSatellite[1] - targetNormal[1] * directionToSatellite[0],
      ]),
      dot(targetNormal, directionToSatellite),
    ),
    azimuthInAntennaRad,
    elevationInAntennaRad,
    azimuthDeviationRad: azimuthInAntennaRad - options.steeringAzimuthRad,
    elevationDeviationRad: elevationInAntennaRad - options.steeringElevationRad,
  };
}

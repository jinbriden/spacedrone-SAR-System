import {
  WGS84_SEMI_MAJOR_AXIS_M,
  WGS84_SEMI_MINOR_AXIS_M,
} from "../constants";
import { add, normalize, scale } from "../math/vector";
import type { Vector3 } from "../types";

export interface RayEllipsoidIntersection {
  pointEcefM: Vector3;
  distanceM: number;
  directionUnitEcef: Vector3;
}

/** Returns the nearest strictly positive WGS84 ellipsoid intersection. */
export function intersectRayWgs84(
  originEcefM: Vector3,
  directionEcef: Vector3,
  positiveDistanceToleranceM = 1e-6,
): RayEllipsoidIntersection | undefined {
  const directionUnitEcef = normalize(directionEcef);
  const inverseA2 = 1 / WGS84_SEMI_MAJOR_AXIS_M ** 2;
  const inverseB2 = 1 / WGS84_SEMI_MINOR_AXIS_M ** 2;
  const [px, py, pz] = originEcefM;
  const [dx, dy, dz] = directionUnitEcef;
  const quadraticA = (dx ** 2 + dy ** 2) * inverseA2 + dz ** 2 * inverseB2;
  const quadraticB = 2 * ((px * dx + py * dy) * inverseA2 + pz * dz * inverseB2);
  const quadraticC = (px ** 2 + py ** 2) * inverseA2 + pz ** 2 * inverseB2 - 1;
  const discriminant = quadraticB ** 2 - 4 * quadraticA * quadraticC;

  if (discriminant < 0) return undefined;
  const squareRoot = Math.sqrt(Math.max(0, discriminant));
  const denominator = 2 * quadraticA;
  const roots = [
    (-quadraticB - squareRoot) / denominator,
    (-quadraticB + squareRoot) / denominator,
  ].filter((distanceM) => distanceM > positiveDistanceToleranceM);
  if (roots.length === 0) return undefined;
  const distanceM = Math.min(...roots);
  return {
    pointEcefM: add(originEcefM, scale(directionUnitEcef, distanceM)),
    distanceM,
    directionUnitEcef,
  };
}

export function wgs84EllipsoidEquationValue(pointEcefM: Vector3): number {
  return (
    (pointEcefM[0] ** 2 + pointEcefM[1] ** 2) / WGS84_SEMI_MAJOR_AXIS_M ** 2 +
    pointEcefM[2] ** 2 / WGS84_SEMI_MINOR_AXIS_M ** 2
  );
}

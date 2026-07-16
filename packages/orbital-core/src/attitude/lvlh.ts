import { cross, dot, normalize, scale, subtract } from "../math/vector";
import type { Vector3 } from "../types";

export interface ReferenceFrameAxes {
  x: Vector3;
  y: Vector3;
  z: Vector3;
}

/**
 * Builds the documented LVLH basis in its parent frame:
 * +X along velocity after radial orthogonalization, +Z toward Earth centre,
 * and +Y = +Z x +X.
 */
export function buildLvlhFrame(
  positionM: Vector3,
  velocityMps: Vector3,
): ReferenceFrameAxes {
  const z = normalize(scale(positionM, -1));
  const velocityRadialComponent = scale(z, dot(velocityMps, z));
  const x = normalize(subtract(velocityMps, velocityRadialComponent));
  const y = normalize(cross(z, x));
  return { x: normalize(cross(y, z)), y, z };
}

/** Converts vector components in a local frame to components in its parent. */
export function frameVectorToParent(
  frame: ReferenceFrameAxes,
  vectorInFrame: Vector3,
): Vector3 {
  return [
    frame.x[0] * vectorInFrame[0] + frame.y[0] * vectorInFrame[1] + frame.z[0] * vectorInFrame[2],
    frame.x[1] * vectorInFrame[0] + frame.y[1] * vectorInFrame[1] + frame.z[1] * vectorInFrame[2],
    frame.x[2] * vectorInFrame[0] + frame.y[2] * vectorInFrame[1] + frame.z[2] * vectorInFrame[2],
  ];
}

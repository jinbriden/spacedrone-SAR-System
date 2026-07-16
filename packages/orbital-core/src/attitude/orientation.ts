import {
  eulerZyxMatrix,
  multiplyMatrixVector,
  transposeMatrix,
} from "../math/matrix3";
import { normalize } from "../math/vector";
import type { Matrix3, Quaternion, Vector3 } from "../types";

export interface EulerAnglesRad {
  rollRad: number;
  pitchRad: number;
  yawRad: number;
}

/** R_body<-LVLH = Rz(yaw) Ry(pitch) Rx(roll), as required by the specification. */
export function bodyFromLvlhMatrix(angles: EulerAnglesRad): Matrix3 {
  return eulerZyxMatrix(angles.rollRad, angles.pitchRad, angles.yawRad);
}

/** Quaternion [x,y,z,w] for the documented Rz(yaw) Ry(pitch) Rx(roll) rotation. */
export function bodyFromLvlhQuaternion(angles: EulerAnglesRad): Quaternion {
  const halfRoll = angles.rollRad / 2;
  const halfPitch = angles.pitchRad / 2;
  const halfYaw = angles.yawRad / 2;
  const cr = Math.cos(halfRoll);
  const sr = Math.sin(halfRoll);
  const cp = Math.cos(halfPitch);
  const sp = Math.sin(halfPitch);
  const cy = Math.cos(halfYaw);
  const sy = Math.sin(halfYaw);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

/** Fixed R_body<-antenna installation matrix using the same documented order. */
export function bodyFromAntennaMatrix(angles: EulerAnglesRad): Matrix3 {
  return eulerZyxMatrix(angles.rollRad, angles.pitchRad, angles.yawRad);
}

/** Maps a body-frame direction into LVLH using the inverse attitude rotation. */
export function bodyDirectionToLvlh(
  directionBody: Vector3,
  bodyFromLvlh: Matrix3,
): Vector3 {
  return normalize(multiplyMatrixVector(transposeMatrix(bodyFromLvlh), directionBody));
}

/** Returns the antenna +Za beam axis expressed in LVLH. */
export function antennaBeamAxisLvlh(
  bodyFromLvlh: Matrix3,
  bodyFromAntenna: Matrix3,
): Vector3 {
  const beamAxisBody = multiplyMatrixVector(bodyFromAntenna, [0, 0, 1]);
  return bodyDirectionToLvlh(beamAxisBody, bodyFromLvlh);
}

/** Maps any antenna-frame direction into LVLH. */
export function antennaDirectionToLvlh(
  directionAntenna: Vector3,
  bodyFromLvlh: Matrix3,
  bodyFromAntenna: Matrix3,
): Vector3 {
  const directionBody = multiplyMatrixVector(bodyFromAntenna, directionAntenna);
  return bodyDirectionToLvlh(directionBody, bodyFromLvlh);
}

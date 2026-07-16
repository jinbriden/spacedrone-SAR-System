export type Vector3 = readonly [number, number, number];
/** Quaternion components in [x, y, z, w] order. */
export type Quaternion = readonly [number, number, number, number];
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface CartesianState {
  positionM: Vector3;
  velocityMps: Vector3;
}

export interface GeodeticPosition {
  longitudeRad: number;
  latitudeRad: number;
  altitudeM: number;
}

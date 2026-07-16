import {
  WGS84_FIRST_ECCENTRICITY_SQUARED,
  WGS84_SEMI_MAJOR_AXIS_M,
  WGS84_SEMI_MINOR_AXIS_M,
} from "../constants";
import type { GeodeticPosition, Vector3 } from "../types";

const ITERATION_TOLERANCE_RAD = 1e-13;
const MAX_ITERATIONS = 12;

/** Converts WGS84 longitude, latitude and ellipsoidal height to ECEF metres. */
export function geodeticToEcef(position: GeodeticPosition): Vector3 {
  const { longitudeRad, latitudeRad, altitudeM } = position;
  const sinLatitude = Math.sin(latitudeRad);
  const cosLatitude = Math.cos(latitudeRad);
  const primeVerticalRadiusM =
    WGS84_SEMI_MAJOR_AXIS_M /
    Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinLatitude ** 2);

  return [
    (primeVerticalRadiusM + altitudeM) * cosLatitude * Math.cos(longitudeRad),
    (primeVerticalRadiusM + altitudeM) * cosLatitude * Math.sin(longitudeRad),
    (primeVerticalRadiusM * (1 - WGS84_FIRST_ECCENTRICITY_SQUARED) + altitudeM) *
      sinLatitude,
  ];
}

/** Converts an ECEF position in metres to WGS84 geodetic coordinates. */
export function ecefToGeodetic(positionEcefM: Vector3): GeodeticPosition {
  const [xM, yM, zM] = positionEcefM;
  const distanceFromAxisM = Math.hypot(xM, yM);

  if (distanceFromAxisM < 1e-9) {
    return {
      longitudeRad: 0,
      latitudeRad: Math.sign(zM || 1) * Math.PI / 2,
      altitudeM: Math.abs(zM) - WGS84_SEMI_MINOR_AXIS_M,
    };
  }

  const longitudeRad = Math.atan2(yM, xM);
  let latitudeRad = Math.atan2(
    zM,
    distanceFromAxisM * (1 - WGS84_FIRST_ECCENTRICITY_SQUARED),
  );
  let altitudeM = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const sinLatitude = Math.sin(latitudeRad);
    const primeVerticalRadiusM =
      WGS84_SEMI_MAJOR_AXIS_M /
      Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinLatitude ** 2);
    altitudeM = distanceFromAxisM / Math.cos(latitudeRad) - primeVerticalRadiusM;
    const nextLatitudeRad = Math.atan2(
      zM,
      distanceFromAxisM *
        (1 -
          (WGS84_FIRST_ECCENTRICITY_SQUARED * primeVerticalRadiusM) /
            (primeVerticalRadiusM + altitudeM)),
    );
    if (Math.abs(nextLatitudeRad - latitudeRad) < ITERATION_TOLERANCE_RAD) {
      latitudeRad = nextLatitudeRad;
      break;
    }
    latitudeRad = nextLatitudeRad;
  }

  const sinLatitude = Math.sin(latitudeRad);
  const primeVerticalRadiusM =
    WGS84_SEMI_MAJOR_AXIS_M /
    Math.sqrt(1 - WGS84_FIRST_ECCENTRICITY_SQUARED * sinLatitude ** 2);
  altitudeM = distanceFromAxisM / Math.cos(latitudeRad) - primeVerticalRadiusM;

  return { longitudeRad, latitudeRad, altitudeM };
}

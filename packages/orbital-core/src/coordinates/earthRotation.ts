import { EARTH_ROTATION_RATE_RAD_S } from "../constants";
import type { CartesianState, Vector3 } from "../types";

const JULIAN_DATE_UNIX_EPOCH = 2_440_587.5;
const MILLISECONDS_PER_DAY = 86_400_000;

/** Greenwich mean sidereal angle for a UTC instant, normalized to [0, 2pi). */
export function greenwichMeanSiderealTimeRad(dateUtc: Date): number {
  const julianDate = JULIAN_DATE_UNIX_EPOCH + dateUtc.getTime() / MILLISECONDS_PER_DAY;
  const centuriesSinceJ2000 = (julianDate - 2_451_545.0) / 36_525;
  const gmstDeg =
    280.460_618_37 +
    360.985_647_366_29 * (julianDate - 2_451_545.0) +
    0.000_387_933 * centuriesSinceJ2000 ** 2 -
    centuriesSinceJ2000 ** 3 / 38_710_000;
  return (((gmstDeg % 360) + 360) % 360) * (Math.PI / 180);
}

function rotateZ(vector: Vector3, angleRad: number): Vector3 {
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return [
    cosine * vector[0] + sine * vector[1],
    -sine * vector[0] + cosine * vector[1],
    vector[2],
  ];
}

/** Rotates a position from the inertial frame into the Earth-fixed frame. */
export function eciToEcef(positionEciM: Vector3, dateUtc: Date): Vector3 {
  return rotateZ(positionEciM, greenwichMeanSiderealTimeRad(dateUtc));
}

/** Rotates a direction or basis vector from ECI to ECEF without translation. */
export function eciVectorToEcef(vectorEci: Vector3, dateUtc: Date): Vector3 {
  return rotateZ(vectorEci, greenwichMeanSiderealTimeRad(dateUtc));
}

/** Converts both ECI position and inertial velocity into an Earth-fixed state. */
export function eciStateToEcef(stateEci: CartesianState, dateUtc: Date): CartesianState {
  const [xM, yM] = stateEci.positionM;
  const velocityRelativeToEarthMps: Vector3 = [
    stateEci.velocityMps[0] + EARTH_ROTATION_RATE_RAD_S * yM,
    stateEci.velocityMps[1] - EARTH_ROTATION_RATE_RAD_S * xM,
    stateEci.velocityMps[2],
  ];
  const angleRad = greenwichMeanSiderealTimeRad(dateUtc);
  return {
    positionM: rotateZ(stateEci.positionM, angleRad),
    velocityMps: rotateZ(velocityRelativeToEarthMps, angleRad),
  };
}

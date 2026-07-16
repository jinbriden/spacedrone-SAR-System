import {
  EARTH_GRAVITATIONAL_PARAMETER_M3_S2,
  WGS84_SEMI_MAJOR_AXIS_M,
} from "../constants";
import type { Vector3 } from "../types";
import type { OrbitPropagator } from "./orbitPropagator";

export interface CircularOrbitParameters {
  altitudeM: number;
  inclinationRad: number;
  raanRad: number;
  initialPhaseRad: number;
  direction?: 1 | -1;
}

export function circularOrbitSpeedMps(altitudeM: number): number {
  if (!Number.isFinite(altitudeM) || altitudeM <= 0) {
    throw new RangeError("轨道高度必须是大于 0 m 的有限数值。");
  }
  return Math.sqrt(
    EARTH_GRAVITATIONAL_PARAMETER_M3_S2 /
      (WGS84_SEMI_MAJOR_AXIS_M + altitudeM),
  );
}

export function circularOrbitPeriodSeconds(altitudeM: number): number {
  const radiusM = WGS84_SEMI_MAJOR_AXIS_M + altitudeM;
  if (!Number.isFinite(altitudeM) || altitudeM <= 0) {
    throw new RangeError("轨道高度必须是大于 0 m 的有限数值。");
  }
  return 2 * Math.PI * Math.sqrt(radiusM ** 3 / EARTH_GRAVITATIONAL_PARAMETER_M3_S2);
}

function rotatePerifocalToEci(
  vector: Vector3,
  inclinationRad: number,
  raanRad: number,
): Vector3 {
  const cosRaan = Math.cos(raanRad);
  const sinRaan = Math.sin(raanRad);
  const cosInclination = Math.cos(inclinationRad);
  const sinInclination = Math.sin(inclinationRad);
  return [
    cosRaan * vector[0] - sinRaan * cosInclination * vector[1],
    sinRaan * vector[0] + cosRaan * cosInclination * vector[1],
    sinInclination * vector[1],
  ];
}

export class CircularOrbitPropagator implements OrbitPropagator {
  readonly periodSeconds: number;
  readonly speedMps: number;
  private readonly radiusM: number;
  private readonly angularRateRadS: number;
  private readonly parameters: Required<CircularOrbitParameters>;

  constructor(parameters: CircularOrbitParameters) {
    if (parameters.inclinationRad < 0 || parameters.inclinationRad > Math.PI) {
      throw new RangeError("轨道倾角必须位于 0 到 pi rad 之间。");
    }
    this.parameters = { direction: 1, ...parameters };
    this.radiusM = WGS84_SEMI_MAJOR_AXIS_M + parameters.altitudeM;
    this.speedMps = circularOrbitSpeedMps(parameters.altitudeM);
    this.periodSeconds = circularOrbitPeriodSeconds(parameters.altitudeM);
    this.angularRateRadS = (2 * Math.PI) / this.periodSeconds;
  }

  propagate(epochSeconds: number) {
    const phaseRad =
      this.parameters.initialPhaseRad +
      this.parameters.direction * this.angularRateRadS * epochSeconds;
    const positionPerifocalM: Vector3 = [
      this.radiusM * Math.cos(phaseRad),
      this.radiusM * Math.sin(phaseRad),
      0,
    ];
    const velocityPerifocalMps: Vector3 = [
      -this.parameters.direction * this.speedMps * Math.sin(phaseRad),
      this.parameters.direction * this.speedMps * Math.cos(phaseRad),
      0,
    ];
    return {
      positionEciM: rotatePerifocalToEci(
        positionPerifocalM,
        this.parameters.inclinationRad,
        this.parameters.raanRad,
      ),
      velocityEciMps: rotatePerifocalToEci(
        velocityPerifocalMps,
        this.parameters.inclinationRad,
        this.parameters.raanRad,
      ),
    };
  }
}

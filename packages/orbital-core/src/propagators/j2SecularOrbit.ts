import {
  EARTH_GRAVITATIONAL_PARAMETER_M3_S2,
  EARTH_J2,
  WGS84_SEMI_MAJOR_AXIS_M,
} from "../constants";
import { add, cross, scale } from "../math/vector";
import type { Vector3 } from "../types";
import {
  KeplerianOrbitPropagator,
  perifocalToEci,
  solveEccentricAnomalyRad,
  trueToMeanAnomalyRad,
  type KeplerianOrbitParameters,
} from "./keplerianOrbit";
import type { OrbitPropagator } from "./orbitPropagator";

export interface J2SecularOrbitParameters extends KeplerianOrbitParameters {
  direction?: 1 | -1;
}

export interface J2SecularRates {
  meanMotionRadS: number;
  raanRateRadS: number;
  argumentOfPeriapsisRateRadS: number;
  meanAnomalyRateRadS: number;
}

export function j2SecularRates(parameters: J2SecularOrbitParameters): J2SecularRates {
  const { semiMajorAxisM: a, eccentricity: e, inclinationRad: i } = parameters;
  const direction = parameters.direction ?? 1;
  const meanMotionRadS = direction * Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER_M3_S2 / a ** 3);
  const semiLatusRectumM = a * (1 - e * e);
  const cosineInclination = Math.cos(i);
  const factor = EARTH_J2
    * meanMotionRadS
    * (WGS84_SEMI_MAJOR_AXIS_M / semiLatusRectumM) ** 2;
  return {
    meanMotionRadS,
    raanRateRadS: -1.5 * factor * cosineInclination,
    argumentOfPeriapsisRateRadS: 0.75 * factor * (5 * cosineInclination ** 2 - 1),
    meanAnomalyRateRadS: meanMotionRadS
      + 0.75 * factor * Math.sqrt(1 - e * e) * (3 * cosineInclination ** 2 - 1),
  };
}

/**
 * First-order secular J2 propagator using mean Keplerian elements.
 * Short-period oscillations and higher gravity terms are intentionally omitted.
 */
export class J2SecularOrbitPropagator implements OrbitPropagator {
  readonly periodSeconds: number;
  readonly rates: J2SecularRates;
  private readonly initialMeanAnomalyRad: number;

  constructor(private readonly parameters: J2SecularOrbitParameters) {
    const twoBody = new KeplerianOrbitPropagator(parameters);
    this.periodSeconds = twoBody.periodSeconds;
    this.rates = j2SecularRates(parameters);
    this.initialMeanAnomalyRad = parameters.anomalyType === "mean"
      ? parameters.initialAnomalyRad
      : trueToMeanAnomalyRad(parameters.initialAnomalyRad, parameters.eccentricity);
  }

  propagate(epochSeconds: number) {
    if (!Number.isFinite(epochSeconds)) throw new RangeError("传播时间必须是有限秒数。");
    const { semiMajorAxisM: a, eccentricity: e } = this.parameters;
    const dynamicParameters: KeplerianOrbitParameters = {
      ...this.parameters,
      raanRad: this.parameters.raanRad + this.rates.raanRateRadS * epochSeconds,
      argumentOfPeriapsisRad: this.parameters.argumentOfPeriapsisRad
        + this.rates.argumentOfPeriapsisRateRadS * epochSeconds,
    };
    const eccentricAnomalyRad = solveEccentricAnomalyRad(
      this.initialMeanAnomalyRad + this.rates.meanAnomalyRateRadS * epochSeconds,
      e,
    );
    const denominator = 1 - e * Math.cos(eccentricAnomalyRad);
    const root = Math.sqrt(1 - e * e);
    const positionPerifocalM: Vector3 = [
      a * (Math.cos(eccentricAnomalyRad) - e),
      a * root * Math.sin(eccentricAnomalyRad),
      0,
    ];
    const velocityPerifocalMps: Vector3 = [
      (-a * this.rates.meanAnomalyRateRadS * Math.sin(eccentricAnomalyRad)) / denominator,
      (a * this.rates.meanAnomalyRateRadS * root * Math.cos(eccentricAnomalyRad)) / denominator,
      0,
    ];
    const positionEciM = perifocalToEci(positionPerifocalM, dynamicParameters);
    const velocityInRotatingPlaneMps = perifocalToEci(velocityPerifocalMps, dynamicParameters);
    const orbitNormalEci = perifocalToEci([0, 0, 1], dynamicParameters);
    const frameVelocityMps = add(
      cross([0, 0, this.rates.raanRateRadS], positionEciM),
      cross(scale(orbitNormalEci, this.rates.argumentOfPeriapsisRateRadS), positionEciM),
    );
    return {
      positionEciM,
      velocityEciMps: add(velocityInRotatingPlaneMps, frameVelocityMps),
    };
  }
}

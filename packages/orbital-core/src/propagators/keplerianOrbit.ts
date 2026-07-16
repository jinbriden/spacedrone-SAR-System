import {
  EARTH_GRAVITATIONAL_PARAMETER_M3_S2,
  WGS84_SEMI_MAJOR_AXIS_M,
} from "../constants";
import type { Vector3 } from "../types";
import type { OrbitPropagator } from "./orbitPropagator";

export interface KeplerianOrbitParameters {
  semiMajorAxisM: number;
  eccentricity: number;
  inclinationRad: number;
  raanRad: number;
  argumentOfPeriapsisRad: number;
  initialAnomalyRad: number;
  anomalyType: "mean" | "true";
}

function normalizeAngle(angleRad: number): number {
  const wrapped = angleRad % (2 * Math.PI);
  return wrapped < 0 ? wrapped + 2 * Math.PI : wrapped;
}

export function trueToMeanAnomalyRad(trueAnomalyRad: number, eccentricity: number): number {
  const eccentricAnomalyRad = 2 * Math.atan2(
    Math.sqrt(1 - eccentricity) * Math.sin(trueAnomalyRad / 2),
    Math.sqrt(1 + eccentricity) * Math.cos(trueAnomalyRad / 2),
  );
  return normalizeAngle(eccentricAnomalyRad - eccentricity * Math.sin(eccentricAnomalyRad));
}

/** Solves M = E - e sin(E) for an elliptic orbit using Newton iteration. */
export function solveEccentricAnomalyRad(meanAnomalyRad: number, eccentricity: number): number {
  if (!Number.isFinite(meanAnomalyRad) || !Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) {
    throw new RangeError("椭圆轨道要求有限平近点角且偏心率位于 [0, 1)。");
  }
  const mean = normalizeAngle(meanAnomalyRad);
  let eccentric = eccentricity < 0.8 ? mean : Math.PI;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const residual = eccentric - eccentricity * Math.sin(eccentric) - mean;
    const next = eccentric - residual / (1 - eccentricity * Math.cos(eccentric));
    if (Math.abs(next - eccentric) < 1e-13) return next;
    eccentric = next;
  }
  throw new Error("开普勒方程在 30 次迭代内未收敛，请检查偏心率和近点角。");
}

export function perifocalToEci(vector: Vector3, parameters: KeplerianOrbitParameters): Vector3 {
  const cosO = Math.cos(parameters.raanRad);
  const sinO = Math.sin(parameters.raanRad);
  const cosI = Math.cos(parameters.inclinationRad);
  const sinI = Math.sin(parameters.inclinationRad);
  const cosW = Math.cos(parameters.argumentOfPeriapsisRad);
  const sinW = Math.sin(parameters.argumentOfPeriapsisRad);
  return [
    (cosO * cosW - sinO * sinW * cosI) * vector[0]
      + (-cosO * sinW - sinO * cosW * cosI) * vector[1]
      + sinO * sinI * vector[2],
    (sinO * cosW + cosO * sinW * cosI) * vector[0]
      + (-sinO * sinW + cosO * cosW * cosI) * vector[1]
      - cosO * sinI * vector[2],
    sinW * sinI * vector[0] + cosW * sinI * vector[1] + cosI * vector[2],
  ];
}

export class KeplerianOrbitPropagator implements OrbitPropagator {
  readonly periodSeconds: number;
  private readonly meanMotionRadS: number;
  private readonly initialMeanAnomalyRad: number;

  constructor(private readonly parameters: KeplerianOrbitParameters) {
    const { semiMajorAxisM, eccentricity, inclinationRad } = parameters;
    if (!Number.isFinite(semiMajorAxisM) || semiMajorAxisM <= WGS84_SEMI_MAJOR_AXIS_M) {
      throw new RangeError("半长轴必须大于 WGS84 地球长半轴。");
    }
    if (!Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) {
      throw new RangeError("椭圆轨道偏心率必须位于 [0, 1)。");
    }
    if (semiMajorAxisM * (1 - eccentricity) <= WGS84_SEMI_MAJOR_AXIS_M) {
      throw new RangeError("近地点位于 WGS84 地球内部，请增大半长轴或减小偏心率。");
    }
    if (!Number.isFinite(inclinationRad) || inclinationRad < 0 || inclinationRad > Math.PI) {
      throw new RangeError("轨道倾角必须位于 0 到 pi rad 之间。");
    }
    this.meanMotionRadS = Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER_M3_S2 / semiMajorAxisM ** 3);
    this.periodSeconds = (2 * Math.PI) / this.meanMotionRadS;
    this.initialMeanAnomalyRad = parameters.anomalyType === "mean"
      ? normalizeAngle(parameters.initialAnomalyRad)
      : trueToMeanAnomalyRad(parameters.initialAnomalyRad, eccentricity);
  }

  propagate(epochSeconds: number) {
    if (!Number.isFinite(epochSeconds)) throw new RangeError("传播时间必须是有限秒数。");
    const { semiMajorAxisM: a, eccentricity: e } = this.parameters;
    const eccentricAnomaly = solveEccentricAnomalyRad(
      this.initialMeanAnomalyRad + this.meanMotionRadS * epochSeconds,
      e,
    );
    const denominator = 1 - e * Math.cos(eccentricAnomaly);
    const root = Math.sqrt(1 - e * e);
    const positionPerifocalM: Vector3 = [
      a * (Math.cos(eccentricAnomaly) - e),
      a * root * Math.sin(eccentricAnomaly),
      0,
    ];
    const velocityPerifocalMps: Vector3 = [
      (-a * this.meanMotionRadS * Math.sin(eccentricAnomaly)) / denominator,
      (a * this.meanMotionRadS * root * Math.cos(eccentricAnomaly)) / denominator,
      0,
    ];
    return {
      positionEciM: perifocalToEci(positionPerifocalM, this.parameters),
      velocityEciMps: perifocalToEci(velocityPerifocalMps, this.parameters),
    };
  }
}

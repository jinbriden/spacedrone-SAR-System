import {
  CircularOrbitPropagator,
  DEG_TO_RAD,
  J2SecularOrbitPropagator,
  KeplerianOrbitPropagator,
  WGS84_SEMI_MAJOR_AXIS_M,
  TleSgp4OrbitPropagator,
  type OrbitPropagator,
} from "@spacedrone/orbital-core";
import type { CircularOrbitConfig } from "../stores/simulationStore";

export function createConfiguredOrbitPropagator(
  orbit: CircularOrbitConfig,
): OrbitPropagator {
  if (orbit.mode === "tle") {
    return new TleSgp4OrbitPropagator({
      line1: orbit.tleLine1,
      line2: orbit.tleLine2,
      simulationEpochUtc: orbit.epochUtc,
    });
  }
  if (orbit.mode === "keplerian") {
    const parameters = {
      semiMajorAxisM: orbit.semiMajorAxisM,
      eccentricity: orbit.eccentricity,
      inclinationRad: orbit.inclinationDeg * DEG_TO_RAD,
      raanRad: orbit.raanDeg * DEG_TO_RAD,
      argumentOfPeriapsisRad: orbit.argumentOfPeriapsisDeg * DEG_TO_RAD,
      initialAnomalyRad: orbit.initialAnomalyDeg * DEG_TO_RAD,
      anomalyType: orbit.anomalyType,
    };
    return orbit.propagationModel === "j2Secular"
      ? new J2SecularOrbitPropagator(parameters)
      : new KeplerianOrbitPropagator(parameters);
  }
  if (orbit.propagationModel === "j2Secular") {
    return new J2SecularOrbitPropagator({
      semiMajorAxisM: orbit.altitudeM + WGS84_SEMI_MAJOR_AXIS_M,
      eccentricity: 0,
      inclinationRad: orbit.inclinationDeg * DEG_TO_RAD,
      raanRad: orbit.raanDeg * DEG_TO_RAD,
      argumentOfPeriapsisRad: 0,
      initialAnomalyRad: orbit.initialPhaseDeg * DEG_TO_RAD,
      anomalyType: "mean",
      direction: orbit.direction,
    });
  }
  return new CircularOrbitPropagator({
    altitudeM: orbit.altitudeM,
    inclinationRad: orbit.inclinationDeg * DEG_TO_RAD,
    raanRad: orbit.raanDeg * DEG_TO_RAD,
    initialPhaseRad: orbit.initialPhaseDeg * DEG_TO_RAD,
    direction: orbit.direction,
  });
}

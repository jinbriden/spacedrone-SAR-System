import {
  DEG_TO_RAD,
  computeSarRangeHistory,
  deriveSarSystemParameters,
  eciStateToEcef,
  eciVectorToEcef,
  geodeticToEcef,
  type SarRangeHistory,
  type DerivedSarSystemParameters,
} from "@spacedrone/orbital-core";
import { createConfiguredOrbitPropagator } from "../simulation/orbitFactory";
import type { CircularOrbitConfig, GroundTargetConfig, SarConfig } from "../stores/simulationStore";

export interface SarAnalysisRequest {
  orbit: CircularOrbitConfig;
  target: GroundTargetConfig;
  config: SarConfig;
}

export interface SarAnalysisResult {
  targetId: string;
  targetName: string;
  startSeconds: number;
  endSeconds: number;
  startUtc: string;
  endUtc: string;
  system: DerivedSarSystemParameters;
  history: SarRangeHistory;
}

/** Samples the primary satellite at PRF cadence and computes monostatic range/Doppler history. */
export function computeSarAnalysis(request: SarAnalysisRequest): SarAnalysisResult {
  const system = deriveSarSystemParameters(request.config);
  const startSeconds = request.config.analysisCenterSeconds - request.config.apertureDurationSeconds / 2;
  if (startSeconds < 0) throw new RangeError("SAR 合成孔径起始时刻不能早于仿真 0 s，请增大中心时刻。");
  const propagator = createConfiguredOrbitPropagator(request.orbit);
  const epoch = new Date(request.orbit.epochUtc);
  const targetPositionEcefM = geodeticToEcef({
    longitudeRad: request.target.longitudeDeg * DEG_TO_RAD,
    latitudeRad: request.target.latitudeDeg * DEG_TO_RAD,
    altitudeM: request.target.altitudeM,
  });
  const samples = Array.from({ length: system.slowTimeSampleCount }, (_, index) => {
    const slowTimeSeconds = startSeconds + index / system.prfHz;
    const stateEci = propagator.propagate(slowTimeSeconds);
    const dateUtc = new Date(epoch.getTime() + slowTimeSeconds * 1000);
    const earthRotationDateUtc = request.orbit.earthRotationEnabled ? dateUtc : epoch;
    const stateEcef = request.orbit.earthRotationEnabled
      ? eciStateToEcef({ positionM: stateEci.positionEciM, velocityMps: stateEci.velocityEciMps }, earthRotationDateUtc)
      : {
          positionM: eciVectorToEcef(stateEci.positionEciM, earthRotationDateUtc),
          velocityMps: eciVectorToEcef(stateEci.velocityEciMps, earthRotationDateUtc),
        };
    return {
      slowTimeSeconds,
      sensorPositionEcefM: stateEcef.positionM,
      sensorVelocityEcefMps: stateEcef.velocityMps,
      targetPositionEcefM,
    };
  });
  const history = computeSarRangeHistory(samples, system);
  const endSeconds = history.samples.at(-1)!.slowTimeSeconds;
  return {
    targetId: request.target.id,
    targetName: request.target.name,
    startSeconds,
    endSeconds,
    startUtc: new Date(epoch.getTime() + startSeconds * 1000).toISOString(),
    endUtc: new Date(epoch.getTime() + endSeconds * 1000).toISOString(),
    system,
    history,
  };
}

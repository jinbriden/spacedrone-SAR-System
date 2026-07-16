import { DEG_TO_RAD, RAD_TO_DEG, validateAttitudeLimits } from "@spacedrone/orbital-core";
import type { AttitudeConfig } from "../stores/simulationStore";

export function validateAttitudeConfigLimits(attitude: AttitudeConfig) {
  const diagnostics = validateAttitudeLimits(
    { rollRad: attitude.rollDeg * DEG_TO_RAD, pitchRad: attitude.pitchDeg * DEG_TO_RAD, yawRad: attitude.yawDeg * DEG_TO_RAD },
    attitude.sequence.map((sample) => ({
      timeSeconds: sample.timeSeconds,
      rollRad: sample.rollDeg * DEG_TO_RAD,
      pitchRad: sample.pitchDeg * DEG_TO_RAD,
      yawRad: sample.yawDeg * DEG_TO_RAD,
    })),
    {
      maxRollRad: attitude.maxRollDeg * DEG_TO_RAD,
      maxPitchRad: attitude.maxPitchDeg * DEG_TO_RAD,
      maxYawRad: attitude.maxYawDeg * DEG_TO_RAD,
      maxAngularRateRadS: attitude.maxAngularRateDegS * DEG_TO_RAD,
      maxAngularAccelerationRadS2: attitude.maxAngularAccelerationDegS2 * DEG_TO_RAD,
    },
  );
  return {
    maxObservedAngularRateDegS: diagnostics.maxObservedAngularRateRadS * RAD_TO_DEG,
    maxObservedAngularAccelerationDegS2: diagnostics.maxObservedAngularAccelerationRadS2 * RAD_TO_DEG,
  };
}

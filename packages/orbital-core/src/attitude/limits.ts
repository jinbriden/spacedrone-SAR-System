import type { AttitudeSequenceSampleRad } from "./sequence";

export interface AttitudeLimitsRad {
  maxRollRad: number;
  maxPitchRad: number;
  maxYawRad: number;
  maxAngularRateRadS: number;
  maxAngularAccelerationRadS2: number;
}

export interface AttitudeLimitDiagnostics {
  maxObservedAngularRateRadS: number;
  maxObservedAngularAccelerationRadS2: number;
}

function shortestDelta(startRad: number, endRad: number): number {
  const twoPi = 2 * Math.PI;
  return ((endRad - startRad + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label}必须是正的有限数值。`);
}

export function validateAttitudeLimits(
  fixed: { rollRad: number; pitchRad: number; yawRad: number },
  samples: readonly AttitudeSequenceSampleRad[],
  limits: AttitudeLimitsRad,
): AttitudeLimitDiagnostics {
  assertPositive(limits.maxRollRad, "最大滚转角");
  assertPositive(limits.maxPitchRad, "最大俯仰角");
  assertPositive(limits.maxYawRad, "最大偏航角");
  assertPositive(limits.maxAngularRateRadS, "最大角速度");
  assertPositive(limits.maxAngularAccelerationRadS2, "最大角加速度");
  const checkAngles = (angles: typeof fixed, label: string) => {
    if (Math.abs(angles.rollRad) > limits.maxRollRad + 1e-12) throw new RangeError(`${label}滚转角超过最大滚转角。`);
    if (Math.abs(angles.pitchRad) > limits.maxPitchRad + 1e-12) throw new RangeError(`${label}俯仰角超过最大俯仰角。`);
    if (Math.abs(angles.yawRad) > limits.maxYawRad + 1e-12) throw new RangeError(`${label}偏航角超过最大偏航角。`);
  };
  checkAngles(fixed, "固定姿态");
  samples.forEach((sample, index) => checkAngles(sample, `姿态序列第 ${index + 1} 点`));

  const rates: Array<{ timeSeconds: number; vector: [number, number, number] }> = [];
  let maxObservedAngularRateRadS = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const first = samples[index - 1];
    const second = samples[index];
    const deltaTime = second.timeSeconds - first.timeSeconds;
    if (!(deltaTime > 0)) throw new RangeError("姿态序列时间必须严格递增。" );
    const vector: [number, number, number] = [
      shortestDelta(first.rollRad, second.rollRad) / deltaTime,
      shortestDelta(first.pitchRad, second.pitchRad) / deltaTime,
      shortestDelta(first.yawRad, second.yawRad) / deltaTime,
    ];
    const magnitude = Math.hypot(...vector);
    maxObservedAngularRateRadS = Math.max(maxObservedAngularRateRadS, magnitude);
    if (magnitude > limits.maxAngularRateRadS + 1e-12) throw new RangeError(`姿态序列第 ${index}～${index + 1} 点角速度 ${magnitude} rad/s 超过限制。`);
    rates.push({ timeSeconds: (first.timeSeconds + second.timeSeconds) / 2, vector });
  }

  let maxObservedAngularAccelerationRadS2 = 0;
  for (let index = 1; index < rates.length; index += 1) {
    const deltaTime = rates[index].timeSeconds - rates[index - 1].timeSeconds;
    const acceleration = Math.hypot(
      rates[index].vector[0] - rates[index - 1].vector[0],
      rates[index].vector[1] - rates[index - 1].vector[1],
      rates[index].vector[2] - rates[index - 1].vector[2],
    ) / deltaTime;
    maxObservedAngularAccelerationRadS2 = Math.max(maxObservedAngularAccelerationRadS2, acceleration);
    if (acceleration > limits.maxAngularAccelerationRadS2 + 1e-12) throw new RangeError(`姿态序列第 ${index} 个转折点角加速度 ${acceleration} rad/s² 超过限制。`);
  }
  return { maxObservedAngularRateRadS, maxObservedAngularAccelerationRadS2 };
}

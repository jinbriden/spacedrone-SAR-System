import type { BeamSteeringLaw, SteeringAnglesRad } from "./steering";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label}必须是有限数值。`);
  return value;
}

export interface ScanSarSteeringOptions {
  azimuthRad: number;
  elevationAnglesRad: readonly number[];
  burstDurationSeconds: number;
}

export function createScanSarSteeringLaw(options: ScanSarSteeringOptions): BeamSteeringLaw {
  finite(options.azimuthRad, "ScanSAR 方位角");
  if (options.elevationAnglesRad.length === 0) throw new RangeError("ScanSAR 至少需要一个子测绘带俯仰角。");
  options.elevationAnglesRad.forEach((angle, index) => finite(angle, `ScanSAR 第 ${index + 1} 子带俯仰角`));
  if (!Number.isFinite(options.burstDurationSeconds) || options.burstDurationSeconds <= 0) {
    throw new RangeError("ScanSAR burst 驻留时间必须大于 0 s。");
  }
  return {
    getSteeringAngles(timeSeconds: number): SteeringAnglesRad {
      finite(timeSeconds, "仿真时间");
      const rawIndex = Math.floor(timeSeconds / options.burstDurationSeconds);
      const index = ((rawIndex % options.elevationAnglesRad.length) + options.elevationAnglesRad.length)
        % options.elevationAnglesRad.length;
      return { azimuthRad: options.azimuthRad, elevationRad: options.elevationAnglesRad[index] };
    },
  };
}

export interface TopsSteeringOptions {
  startAzimuthRad: number;
  endAzimuthRad: number;
  elevationRad: number;
  sweepDurationSeconds: number;
}

export function createTopsSteeringLaw(options: TopsSteeringOptions): BeamSteeringLaw {
  finite(options.startAzimuthRad, "TOPS 起始方位角");
  finite(options.endAzimuthRad, "TOPS 结束方位角");
  finite(options.elevationRad, "TOPS 俯仰角");
  if (!Number.isFinite(options.sweepDurationSeconds) || options.sweepDurationSeconds <= 0) {
    throw new RangeError("TOPS 扫掠周期必须大于 0 s。");
  }
  return {
    getSteeringAngles(timeSeconds: number): SteeringAnglesRad {
      finite(timeSeconds, "仿真时间");
      const normalized = ((timeSeconds % options.sweepDurationSeconds) + options.sweepDurationSeconds)
        % options.sweepDurationSeconds / options.sweepDurationSeconds;
      return {
        azimuthRad: options.startAzimuthRad
          + (options.endAzimuthRad - options.startAzimuthRad) * normalized,
        elevationRad: options.elevationRad,
      };
    },
  };
}

/** Inverse of angularDirectionAntenna for a target in the forward (+Za) hemisphere. */
export function directionToAngularCoordinatesAntenna(
  directionAntenna: readonly [number, number, number],
): SteeringAnglesRad {
  const [x, y, z] = directionAntenna;
  finite(x, "天线方向 X");
  finite(y, "天线方向 Y");
  finite(z, "天线方向 Z");
  if (z <= 0) throw new RangeError("跟踪目标位于天线后半球，无法生成 Spotlight 指向。");
  return { azimuthRad: Math.atan2(x, z), elevationRad: Math.atan2(y, z) };
}

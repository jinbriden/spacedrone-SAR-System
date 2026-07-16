import type { EulerAnglesRad } from "./orientation";

export interface AttitudeSequenceSampleRad extends EulerAnglesRad {
  timeSeconds: number;
}

export interface AttitudeLawConfig {
  mode: "fixed" | "external";
  fixed: EulerAnglesRad;
  samples?: readonly AttitudeSequenceSampleRad[];
}

export interface AttitudeLaw {
  getAttitude(timeSeconds: number): EulerAnglesRad;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label}必须是有限数值。`);
}

function shortestAngleInterpolation(startRad: number, endRad: number, fraction: number): number {
  const twoPi = 2 * Math.PI;
  const delta = ((endRad - startRad + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return startRad + delta * fraction;
}

export function createAttitudeLaw(config: AttitudeLawConfig): AttitudeLaw {
  assertFinite(config.fixed.rollRad, "固定滚转角");
  assertFinite(config.fixed.pitchRad, "固定俯仰角");
  assertFinite(config.fixed.yawRad, "固定偏航角");
  const samples = config.samples ?? [];
  if (config.mode === "external") {
    if (samples.length < 2) throw new RangeError("外部姿态序列至少需要 2 个采样点。");
    samples.forEach((sample, index) => {
      assertFinite(sample.timeSeconds, `姿态序列第 ${index + 1} 点时间`);
      assertFinite(sample.rollRad, `姿态序列第 ${index + 1} 点滚转角`);
      assertFinite(sample.pitchRad, `姿态序列第 ${index + 1} 点俯仰角`);
      assertFinite(sample.yawRad, `姿态序列第 ${index + 1} 点偏航角`);
      if (sample.timeSeconds < 0) throw new RangeError("姿态序列时间不能为负数。");
      if (index > 0 && sample.timeSeconds <= samples[index - 1].timeSeconds) {
        throw new RangeError("姿态序列时间必须严格递增。");
      }
    });
  }

  return {
    getAttitude(timeSeconds: number): EulerAnglesRad {
      assertFinite(timeSeconds, "仿真时间");
      if (config.mode === "fixed") return { ...config.fixed };
      if (timeSeconds <= samples[0].timeSeconds) {
        const { rollRad, pitchRad, yawRad } = samples[0];
        return { rollRad, pitchRad, yawRad };
      }
      const last = samples[samples.length - 1];
      if (timeSeconds >= last.timeSeconds) {
        return { rollRad: last.rollRad, pitchRad: last.pitchRad, yawRad: last.yawRad };
      }
      let lower = 0;
      let upper = samples.length - 1;
      while (upper - lower > 1) {
        const middle = Math.floor((lower + upper) / 2);
        if (samples[middle].timeSeconds <= timeSeconds) lower = middle;
        else upper = middle;
      }
      const first = samples[lower];
      const second = samples[upper];
      const fraction = (timeSeconds - first.timeSeconds) / (second.timeSeconds - first.timeSeconds);
      return {
        rollRad: shortestAngleInterpolation(first.rollRad, second.rollRad, fraction),
        pitchRad: shortestAngleInterpolation(first.pitchRad, second.pitchRad, fraction),
        yawRad: shortestAngleInterpolation(first.yawRad, second.yawRad, fraction),
      };
    },
  };
}

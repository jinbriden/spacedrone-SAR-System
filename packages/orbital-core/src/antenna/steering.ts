export interface SteeringAnglesRad {
  azimuthRad: number;
  elevationRad: number;
}

export interface BeamSteeringLaw {
  getSteeringAngles(timeSeconds: number): SteeringAnglesRad;
}

export type ScanMode = "fixed" | "sine" | "linear" | "custom";
export type ScanAxis = "azimuth" | "elevation";

export interface SteeringTableSampleRad {
  timeSeconds: number;
  azimuthRad: number;
  elevationRad: number;
}

export interface BeamSteeringLawConfig {
  mode: ScanMode;
  axis: ScanAxis;
  baseAzimuthRad: number;
  baseElevationRad: number;
  amplitudeRad: number;
  periodSeconds: number;
  phaseRad?: number;
  tableSamples?: readonly SteeringTableSampleRad[];
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label}必须是有限数值。`);
}

function offsetAlongAxis(
  config: BeamSteeringLawConfig,
  offsetRad: number,
): SteeringAnglesRad {
  return {
    azimuthRad:
      config.baseAzimuthRad + (config.axis === "azimuth" ? offsetRad : 0),
    elevationRad:
      config.baseElevationRad + (config.axis === "elevation" ? offsetRad : 0),
  };
}

export function createBeamSteeringLaw(
  config: BeamSteeringLawConfig,
): BeamSteeringLaw {
  assertFinite(config.baseAzimuthRad, "基础方位角");
  assertFinite(config.baseElevationRad, "基础俯仰角");
  assertFinite(config.amplitudeRad, "扫描幅度");
  if (config.amplitudeRad < 0) throw new RangeError("扫描幅度不能为负数。");
  if ((config.mode === "sine" || config.mode === "linear") && (!Number.isFinite(config.periodSeconds) || config.periodSeconds <= 0)) {
    throw new RangeError("周期扫描的周期必须大于 0 s。");
  }
  const phaseRad = config.phaseRad ?? 0;
  assertFinite(phaseRad, "扫描相位");
  const tableSamples = config.tableSamples ?? [];
  if (config.mode === "custom") {
    if (tableSamples.length < 2) throw new RangeError("自定义扫描时间表至少需要 2 个采样点。");
    tableSamples.forEach((sample, index) => {
      assertFinite(sample.timeSeconds, `自定义扫描第 ${index + 1} 点时间`);
      assertFinite(sample.azimuthRad, `自定义扫描第 ${index + 1} 点方位角`);
      assertFinite(sample.elevationRad, `自定义扫描第 ${index + 1} 点俯仰角`);
      if (sample.timeSeconds < 0) throw new RangeError("自定义扫描时间不能为负数。");
      if (index > 0 && sample.timeSeconds <= tableSamples[index - 1].timeSeconds) {
        throw new RangeError("自定义扫描时间必须严格递增。");
      }
    });
  }

  return {
    getSteeringAngles(timeSeconds: number): SteeringAnglesRad {
      assertFinite(timeSeconds, "仿真时间");
      if (config.mode === "fixed") return offsetAlongAxis(config, 0);
      if (config.mode === "custom") {
        if (timeSeconds <= tableSamples[0].timeSeconds) {
          return {
            azimuthRad: tableSamples[0].azimuthRad,
            elevationRad: tableSamples[0].elevationRad,
          };
        }
        const last = tableSamples[tableSamples.length - 1];
        if (timeSeconds >= last.timeSeconds) {
          return { azimuthRad: last.azimuthRad, elevationRad: last.elevationRad };
        }
        let lower = 0;
        let upper = tableSamples.length - 1;
        while (upper - lower > 1) {
          const middle = Math.floor((lower + upper) / 2);
          if (tableSamples[middle].timeSeconds <= timeSeconds) lower = middle;
          else upper = middle;
        }
        const first = tableSamples[lower];
        const second = tableSamples[upper];
        const fraction = (timeSeconds - first.timeSeconds) / (second.timeSeconds - first.timeSeconds);
        return {
          azimuthRad: first.azimuthRad + (second.azimuthRad - first.azimuthRad) * fraction,
          elevationRad: first.elevationRad + (second.elevationRad - first.elevationRad) * fraction,
        };
      }
      const phase = (2 * Math.PI * timeSeconds) / config.periodSeconds + phaseRad;
      const normalized =
        config.mode === "sine"
          ? Math.sin(phase)
          : (2 / Math.PI) * Math.asin(Math.sin(phase));
      return offsetAlongAxis(config, config.amplitudeRad * normalized);
    },
  };
}

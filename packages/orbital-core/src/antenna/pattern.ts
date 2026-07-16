import { DEG_TO_RAD } from "../constants";
import type { Vector3 } from "../types";
import { angularDirectionAntenna } from "./beam";

export interface AntennaGainPattern {
  name: string;
  azimuthAnglesDeg: number[];
  elevationAnglesDeg: number[];
  /** Rows follow elevationAnglesDeg; columns follow azimuthAnglesDeg. */
  gainDb: number[][];
}

export interface PatternPeak {
  azimuthDeg: number;
  elevationDeg: number;
  gainDb: number;
}

function bracket(axis: readonly number[], coordinate: number): [number, number, number] | undefined {
  if (coordinate < axis[0] || coordinate > axis[axis.length - 1]) return undefined;
  if (coordinate === axis[axis.length - 1]) return [axis.length - 2, axis.length - 1, 1];
  let low = 0;
  let high = axis.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (axis[middle] <= coordinate) low = middle;
    else high = middle;
  }
  return [low, high, (coordinate - axis[low]) / (axis[high] - axis[low])];
}

export function interpolatePatternGainDb(
  pattern: AntennaGainPattern,
  azimuthDeg: number,
  elevationDeg: number,
): number | undefined {
  const azimuth = bracket(pattern.azimuthAnglesDeg, azimuthDeg);
  const elevation = bracket(pattern.elevationAnglesDeg, elevationDeg);
  if (!azimuth || !elevation) return undefined;
  const [az0, az1, azFraction] = azimuth;
  const [el0, el1, elFraction] = elevation;
  const lower = pattern.gainDb[el0][az0] * (1 - azFraction) + pattern.gainDb[el0][az1] * azFraction;
  const upper = pattern.gainDb[el1][az0] * (1 - azFraction) + pattern.gainDb[el1][az1] * azFraction;
  return lower * (1 - elFraction) + upper * elFraction;
}

export function findPatternPeak(pattern: AntennaGainPattern): PatternPeak {
  let peak: PatternPeak = { azimuthDeg: pattern.azimuthAnglesDeg[0], elevationDeg: pattern.elevationAnglesDeg[0], gainDb: -Infinity };
  for (let elevationIndex = 0; elevationIndex < pattern.elevationAnglesDeg.length; elevationIndex += 1) {
    for (let azimuthIndex = 0; azimuthIndex < pattern.azimuthAnglesDeg.length; azimuthIndex += 1) {
      const gainDb = pattern.gainDb[elevationIndex][azimuthIndex];
      if (gainDb > peak.gainDb) {
        peak = {
          azimuthDeg: pattern.azimuthAnglesDeg[azimuthIndex],
          elevationDeg: pattern.elevationAnglesDeg[elevationIndex],
          gainDb: gainDb === 0 ? 0 : gainDb,
        };
      }
    }
  }
  return peak;
}

export interface PatternBoundaryOptions {
  pattern: AntennaGainPattern;
  thresholdDbBelowPeak: number;
  steeringAzimuthRad: number;
  steeringElevationRad: number;
  sampleCount: number;
  /** Scales the extracted angular contour around the pattern origin. */
  angularScale?: number;
}

export interface PatternBoundaryResult {
  directions: Vector3[];
  angularBoundaryDeg: Array<{ azimuthDeg: number; elevationDeg: number }>;
  peak: PatternPeak;
  thresholdGainDb: number;
  clippedByPatternDomain: boolean;
}

/**
 * Extracts the threshold boundary of the main lobe by radial searches from the
 * global grid peak. This deliberately selects one closed, star-shaped lobe and
 * ignores disconnected sidelobes, which keeps the WGS84 footprint ordered.
 */
export function samplePatternGainBoundary(options: PatternBoundaryOptions): PatternBoundaryResult {
  if (!Number.isFinite(options.thresholdDbBelowPeak) || options.thresholdDbBelowPeak <= 0) {
    throw new RangeError("方向图门限衰减必须是正的有限 dB 值。");
  }
  if (!Number.isInteger(options.sampleCount) || options.sampleCount < 4) {
    throw new RangeError("方向图边界采样数必须是至少为 4 的整数。");
  }
  const angularScale = options.angularScale ?? 1;
  if (!Number.isFinite(angularScale) || angularScale <= 0) {
    throw new RangeError("方向图角宽倍率必须是正的有限值。");
  }
  const peak = findPatternPeak(options.pattern);
  const thresholdGainDb = peak.gainDb - options.thresholdDbBelowPeak;
  const minAz = options.pattern.azimuthAnglesDeg[0];
  const maxAz = options.pattern.azimuthAnglesDeg.at(-1)!;
  const minEl = options.pattern.elevationAnglesDeg[0];
  const maxEl = options.pattern.elevationAnglesDeg.at(-1)!;
  let clippedByPatternDomain = false;

  const angularBoundaryDeg = Array.from({ length: options.sampleCount }, (_, index) => {
    const phase = 2 * Math.PI * index / options.sampleCount;
    const dx = Math.cos(phase);
    const dy = Math.sin(phase);
    const azLimit = Math.abs(dx) < 1e-12 ? Infinity : (dx > 0 ? maxAz - peak.azimuthDeg : minAz - peak.azimuthDeg) / dx;
    const elLimit = Math.abs(dy) < 1e-12 ? Infinity : (dy > 0 ? maxEl - peak.elevationDeg : minEl - peak.elevationDeg) / dy;
    const radiusLimit = Math.max(0, Math.min(azLimit, elLimit));
    let insideRadius = 0;
    let outsideRadius: number | undefined;
    for (let step = 1; step <= 128; step += 1) {
      const radius = radiusLimit * step / 128;
      const gain = interpolatePatternGainDb(options.pattern, peak.azimuthDeg + dx * radius, peak.elevationDeg + dy * radius);
      if (gain === undefined || gain < thresholdGainDb) {
        outsideRadius = radius;
        break;
      }
      insideRadius = radius;
    }
    let boundaryRadius = radiusLimit;
    if (outsideRadius === undefined) {
      clippedByPatternDomain = true;
    } else {
      let low = insideRadius;
      let high = outsideRadius;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        const gain = interpolatePatternGainDb(options.pattern, peak.azimuthDeg + dx * middle, peak.elevationDeg + dy * middle);
        if (gain !== undefined && gain >= thresholdGainDb) low = middle;
        else high = middle;
      }
      boundaryRadius = (low + high) / 2;
    }
    return {
      azimuthDeg: peak.azimuthDeg + dx * boundaryRadius,
      elevationDeg: peak.elevationDeg + dy * boundaryRadius,
    };
  });

  const maxDirectionRad = 88.999 * DEG_TO_RAD;
  const directions = angularBoundaryDeg.map((point) => angularDirectionAntenna(
    Math.max(-maxDirectionRad, Math.min(maxDirectionRad, options.steeringAzimuthRad + point.azimuthDeg * angularScale * DEG_TO_RAD)),
    Math.max(-maxDirectionRad, Math.min(maxDirectionRad, options.steeringElevationRad + point.elevationDeg * angularScale * DEG_TO_RAD)),
  ));
  return { directions, angularBoundaryDeg, peak, thresholdGainDb, clippedByPatternDomain };
}

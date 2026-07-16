import { cross, normalize, scale, add } from "../math/vector";
import type { Vector3 } from "../types";

const MAX_ANGULAR_COORDINATE_RAD = (89 * Math.PI) / 180;

function validateAngularCoordinate(angleRad: number, label: string): void {
  if (!Number.isFinite(angleRad) || Math.abs(angleRad) >= MAX_ANGULAR_COORDINATE_RAD) {
    throw new RangeError(`${label}必须是绝对值小于 89 deg 的有限角度。`);
  }
}

function validateBeamwidth(fullWidthRad: number, label: string): void {
  if (!Number.isFinite(fullWidthRad) || fullWidthRad <= 0 || fullWidthRad >= Math.PI) {
    throw new RangeError(`${label}必须位于 0 到 180 deg 之间。`);
  }
}

function validateSampleCount(sampleCount: number): void {
  if (!Number.isInteger(sampleCount) || sampleCount < 4) {
    throw new RangeError("波束边界采样数必须是至少为 4 的整数。");
  }
}

/**
 * Antenna angular-domain convention: +azimuth tilts +Za toward +Xa;
 * +elevation tilts +Za toward +Ya. Both inputs are radians.
 */
export function angularDirectionAntenna(
  azimuthRad: number,
  elevationRad: number,
): Vector3 {
  validateAngularCoordinate(azimuthRad, "方位角");
  validateAngularCoordinate(elevationRad, "俯仰角");
  return normalize([Math.tan(azimuthRad), Math.tan(elevationRad), 1]);
}

export interface CircularBeamBoundaryOptions {
  steeringAzimuthRad: number;
  steeringElevationRad: number;
  fullBeamwidthRad: number;
  sampleCount: number;
}

export function sampleCircularBeamBoundary(
  options: CircularBeamBoundaryOptions,
): Vector3[] {
  validateBeamwidth(options.fullBeamwidthRad, "圆锥波束全宽");
  validateSampleCount(options.sampleCount);
  const center = angularDirectionAntenna(
    options.steeringAzimuthRad,
    options.steeringElevationRad,
  );
  const referenceY: Vector3 = Math.abs(center[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const azimuthTangent = normalize(cross(referenceY, center));
  const elevationTangent = normalize(cross(center, azimuthTangent));
  const halfAngleRad = options.fullBeamwidthRad / 2;
  const axialScale = Math.cos(halfAngleRad);
  const radialScale = Math.sin(halfAngleRad);

  return Array.from({ length: options.sampleCount }, (_, index) => {
    const phaseRad = (2 * Math.PI * index) / options.sampleCount;
    const radial = add(
      scale(azimuthTangent, Math.cos(phaseRad)),
      scale(elevationTangent, Math.sin(phaseRad)),
    );
    return normalize(add(scale(center, axialScale), scale(radial, radialScale)));
  });
}

export interface RectangularBeamBoundaryOptions {
  steeringAzimuthRad: number;
  steeringElevationRad: number;
  azimuthFullBeamwidthRad: number;
  elevationFullBeamwidthRad: number;
  sampleCount: number;
}

/** Samples all four angular-domain edges in order, without duplicate corners. */
export function sampleRectangularBeamBoundary(
  options: RectangularBeamBoundaryOptions,
): Vector3[] {
  validateBeamwidth(options.azimuthFullBeamwidthRad, "方位波束全宽");
  validateBeamwidth(options.elevationFullBeamwidthRad, "俯仰波束全宽");
  validateSampleCount(options.sampleCount);
  const halfAz = options.azimuthFullBeamwidthRad / 2;
  const halfEl = options.elevationFullBeamwidthRad / 2;

  return Array.from({ length: options.sampleCount }, (_, index) => {
    const perimeterCoordinate = (4 * index) / options.sampleCount;
    const side = Math.floor(perimeterCoordinate);
    const fraction = perimeterCoordinate - side;
    let azimuthOffsetRad = 0;
    let elevationOffsetRad = 0;
    if (side === 0) {
      azimuthOffsetRad = -halfAz + 2 * halfAz * fraction;
      elevationOffsetRad = -halfEl;
    } else if (side === 1) {
      azimuthOffsetRad = halfAz;
      elevationOffsetRad = -halfEl + 2 * halfEl * fraction;
    } else if (side === 2) {
      azimuthOffsetRad = halfAz - 2 * halfAz * fraction;
      elevationOffsetRad = halfEl;
    } else {
      azimuthOffsetRad = -halfAz;
      elevationOffsetRad = halfEl - 2 * halfEl * fraction;
    }
    return angularDirectionAntenna(
      options.steeringAzimuthRad + azimuthOffsetRad,
      options.steeringElevationRad + elevationOffsetRad,
    );
  });
}

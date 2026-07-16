import { intersection } from "polygon-clipping";
import { WGS84_SEMI_MAJOR_AXIS_M } from "../constants";
import { splitCoverageAtAntimeridian, type GeodeticDegreesPoint } from "../coverage/polygonUnion";

function normalizeLongitude(longitudeDeg: number): number {
  return ((longitudeDeg + 180) % 360 + 360) % 360 - 180;
}

function destinationFromLocalOffset(
  center: GeodeticDegreesPoint,
  eastM: number,
  northM: number,
): GeodeticDegreesPoint {
  const distanceM = Math.hypot(eastM, northM);
  if (distanceM === 0) return { ...center };
  const angularDistance = distanceM / WGS84_SEMI_MAJOR_AXIS_M;
  const bearing = Math.atan2(eastM, northM);
  const latitude1 = center.latitudeDeg * Math.PI / 180;
  const longitude1 = center.longitudeDeg * Math.PI / 180;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance)
      + Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude2 = longitude1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
    Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2),
  );
  return { longitudeDeg: normalizeLongitude(longitude2 * 180 / Math.PI), latitudeDeg: latitude2 * 180 / Math.PI };
}

export function sampleCircularTargetRegion(
  center: GeodeticDegreesPoint,
  radiusM: number,
  sampleCount = 64,
): GeodeticDegreesPoint[] {
  if (!Number.isFinite(radiusM) || radiusM <= 0) throw new RangeError("圆形任务区域半径必须是正的有限米数。" );
  if (!Number.isInteger(sampleCount) || sampleCount < 16) throw new RangeError("圆形任务区域至少需要 16 个边界点。" );
  return Array.from({ length: sampleCount }, (_, index) => {
    const phase = 2 * Math.PI * index / sampleCount;
    return destinationFromLocalOffset(center, radiusM * Math.cos(phase), radiusM * Math.sin(phase));
  });
}

export function sampleRectangularTargetRegion(
  center: GeodeticDegreesPoint,
  widthM: number,
  heightM: number,
): GeodeticDegreesPoint[] {
  if (!Number.isFinite(widthM) || widthM <= 0 || !Number.isFinite(heightM) || heightM <= 0) {
    throw new RangeError("矩形任务区域宽度和高度必须是正的有限米数。" );
  }
  const halfWidth = widthM / 2;
  const halfHeight = heightM / 2;
  return [
    destinationFromLocalOffset(center, -halfWidth, -halfHeight),
    destinationFromLocalOffset(center, halfWidth, -halfHeight),
    destinationFromLocalOffset(center, halfWidth, halfHeight),
    destinationFromLocalOffset(center, -halfWidth, halfHeight),
  ];
}

export function geodeticRegionsIntersect(
  first: readonly GeodeticDegreesPoint[],
  second: readonly GeodeticDegreesPoint[],
): boolean {
  if (first.length < 3 || second.length < 3) return false;
  const firstGeometry = splitCoverageAtAntimeridian(first);
  const secondGeometry = splitCoverageAtAntimeridian(second);
  if (firstGeometry.length === 0 || secondGeometry.length === 0) return false;
  return intersection(firstGeometry, secondGeometry).some((polygon) => polygon[0]?.length >= 4);
}

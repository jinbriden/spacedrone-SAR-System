import { RAD_TO_DEG } from "../constants";
import { ecefToGeodetic } from "../coordinates/geodetic";
import { add, magnitude, normalize, scale, subtract } from "../math/vector";
import type { Vector3 } from "../types";
import { interpolateTerrainHeightM, type TerrainHeightGrid } from "./heightGrid";

export interface TerrainLineOfSightResult {
  clear: boolean;
  sampleCount: number;
  obstruction?: { pointEcefM: Vector3; longitudeDeg: number; latitudeDeg: number; altitudeM: number; surfaceHeightM: number; distanceFromObserverM: number };
}

/** Samples the straight ECEF sight segment against WGS84 plus DEM elevation. Endpoints are excluded. */
export function evaluateTerrainLineOfSight(
  observerEcefM: Vector3,
  targetEcefM: Vector3,
  grid: TerrainHeightGrid,
  sampleSpacingM = 1000,
  clearanceM = 0,
): TerrainLineOfSightResult {
  if (!Number.isFinite(sampleSpacingM) || sampleSpacingM <= 0) throw new RangeError("地形视线采样间隔必须大于 0 m。");
  if (!Number.isFinite(clearanceM) || clearanceM < 0) throw new RangeError("地形视线净空必须是非负值。");
  const delta = subtract(targetEcefM, observerEcefM);
  const distanceM = magnitude(delta);
  const direction = normalize(delta);
  const intervalCount = Math.max(1, Math.ceil(distanceM / sampleSpacingM));
  if (intervalCount > 100_000) throw new RangeError("地形视线采样最多 100000 段，请增大采样间隔。");
  for (let index = 1; index < intervalCount; index += 1) {
    const distanceFromObserverM = distanceM * index / intervalCount;
    const pointEcefM = add(observerEcefM, scale(direction, distanceFromObserverM));
    const geodetic = ecefToGeodetic(pointEcefM);
    const longitudeDeg = geodetic.longitudeRad * RAD_TO_DEG;
    const latitudeDeg = geodetic.latitudeRad * RAD_TO_DEG;
    const surfaceHeightM = interpolateTerrainHeightM(grid, longitudeDeg, latitudeDeg) ?? 0;
    if (geodetic.altitudeM <= surfaceHeightM + clearanceM) {
      return { clear: false, sampleCount: intervalCount - 1, obstruction: { pointEcefM, longitudeDeg, latitudeDeg, altitudeM: geodetic.altitudeM, surfaceHeightM, distanceFromObserverM } };
    }
  }
  return { clear: true, sampleCount: Math.max(0, intervalCount - 1) };
}

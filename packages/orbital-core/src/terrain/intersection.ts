import { RAD_TO_DEG } from "../constants";
import { ecefToGeodetic } from "../coordinates/geodetic";
import { intersectRayWgs84, type RayEllipsoidIntersection } from "../intersection/rayEllipsoid";
import { add, normalize, scale } from "../math/vector";
import type { Vector3 } from "../types";
import { interpolateTerrainHeightM, terrainHeightRangeM, type TerrainHeightGrid } from "./heightGrid";

export interface TerrainRayIntersection extends RayEllipsoidIntersection {
  terrainHeightM: number;
  usedTerrain: boolean;
}

export interface TerrainIntersectionOptions {
  toleranceM?: number;
  maximumIterations?: number;
  fallbackToEllipsoid?: boolean;
}

/** Finds the first ray intersection with h(lon,lat)=DEM height, falling back to WGS84 outside the grid when configured. */
export function intersectRayTerrain(
  originEcefM: Vector3,
  directionEcef: Vector3,
  grid: TerrainHeightGrid,
  options: TerrainIntersectionOptions = {},
): TerrainRayIntersection | undefined {
  const ellipsoid = intersectRayWgs84(originEcefM, directionEcef);
  if (!ellipsoid) return undefined;
  const directionUnitEcef = normalize(directionEcef);
  const toleranceM = options.toleranceM ?? 0.1;
  const maximumIterations = options.maximumIterations ?? 64;
  const fallbackToEllipsoid = options.fallbackToEllipsoid ?? true;
  const surfaceAt = (distanceM: number) => {
    const pointEcefM = add(originEcefM, scale(directionUnitEcef, distanceM));
    const geodetic = ecefToGeodetic(pointEcefM);
    const terrainHeightM = interpolateTerrainHeightM(grid, geodetic.longitudeRad * RAD_TO_DEG, geodetic.latitudeRad * RAD_TO_DEG);
    return { pointEcefM, geodetic, terrainHeightM, differenceM: geodetic.altitudeM - (terrainHeightM ?? 0) };
  };
  const ellipsoidSurface = surfaceAt(ellipsoid.distanceM);
  if (ellipsoidSurface.terrainHeightM === undefined) {
    return fallbackToEllipsoid ? { ...ellipsoid, terrainHeightM: 0, usedTerrain: false } : undefined;
  }
  let lower = 0;
  let upper = ellipsoid.distanceM;
  let upperSurface = ellipsoidSurface;
  if (upperSurface.differenceM > 0) {
    const minimumHeightM = terrainHeightRangeM(grid).minimumM;
    upper += Math.max(1000, -minimumHeightM * 2 + 100);
    upperSurface = surfaceAt(upper);
  }
  if (upperSurface.differenceM > 0) return fallbackToEllipsoid ? { ...ellipsoid, terrainHeightM: 0, usedTerrain: false } : undefined;
  for (let iteration = 0; iteration < maximumIterations && upper - lower > toleranceM; iteration += 1) {
    const middle = (lower + upper) / 2;
    const sample = surfaceAt(middle);
    if (sample.terrainHeightM === undefined && !fallbackToEllipsoid) return undefined;
    if (sample.differenceM > 0) lower = middle;
    else { upper = middle; upperSurface = sample; }
  }
  const distanceM = (lower + upper) / 2;
  const final = surfaceAt(distanceM);
  return {
    pointEcefM: final.pointEcefM,
    distanceM,
    directionUnitEcef,
    terrainHeightM: final.terrainHeightM ?? 0,
    usedTerrain: final.terrainHeightM !== undefined,
  };
}

import { describe, expect, it } from "vitest";
import { geodeticToEcef } from "../coordinates/geodetic";
import { DEG_TO_RAD } from "../constants";
import { interpolateTerrainHeightM, validateTerrainHeightGrid, type TerrainHeightGrid } from "./heightGrid";
import { intersectRayTerrain } from "./intersection";
import { evaluateTerrainLineOfSight } from "./lineOfSight";

const flatGrid: TerrainHeightGrid = { name: "flat-100", longitudeDeg: [-1, 0, 1], latitudeDeg: [-1, 0, 1], heightM: [[100, 100, 100], [100, 100, 100], [100, 100, 100]] };

describe("terrain height grid and geometry", () => {
  it("validates and bilinearly interpolates a regular grid including wrapped longitude", () => {
    const grid: TerrainHeightGrid = { name: "plane", longitudeDeg: [179, 180, 181], latitudeDeg: [0, 1], heightM: [[0, 10, 20], [20, 30, 40]] };
    validateTerrainHeightGrid(grid);
    expect(interpolateTerrainHeightM(grid, -179.5, 0.5)).toBeCloseTo(25);
    expect(interpolateTerrainHeightM(grid, 0, 0.5)).toBeUndefined();
  });

  it("intersects a radial ray at the DEM elevation above WGS84", () => {
    const origin = geodeticToEcef({ longitudeRad: 0, latitudeRad: 0, altitudeM: 1000 });
    const result = intersectRayTerrain(origin, [-1, 0, 0], flatGrid, { toleranceM: 0.01 });
    expect(result?.usedTerrain).toBe(true);
    expect(result?.terrainHeightM).toBe(100);
    expect(result?.distanceM).toBeCloseTo(900, 1);
  });

  it("detects a terrain obstruction and leaves a high sight line clear", () => {
    const ridge: TerrainHeightGrid = { name: "ridge", longitudeDeg: [-0.02, 0, 0.02], latitudeDeg: [-0.01, 0.01], heightM: [[0, 1000, 0], [0, 1000, 0]] };
    const lowObserver = geodeticToEcef({ longitudeRad: -0.01 * DEG_TO_RAD, latitudeRad: 0, altitudeM: 500 });
    const target = geodeticToEcef({ longitudeRad: 0.01 * DEG_TO_RAD, latitudeRad: 0, altitudeM: 500 });
    expect(evaluateTerrainLineOfSight(lowObserver, target, ridge, 100).clear).toBe(false);
    const highObserver = geodeticToEcef({ longitudeRad: -0.01 * DEG_TO_RAD, latitudeRad: 0, altitudeM: 3000 });
    const highTarget = geodeticToEcef({ longitudeRad: 0.01 * DEG_TO_RAD, latitudeRad: 0, altitudeM: 3000 });
    expect(evaluateTerrainLineOfSight(highObserver, highTarget, ridge, 100).clear).toBe(true);
  });
});

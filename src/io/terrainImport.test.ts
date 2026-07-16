import { describe, expect, it } from "vitest";
import { parseTerrainCsv, parseTerrainJson } from "./terrainImport";

describe("terrain import", () => {
  it("parses JSON regular height grids", () => {
    const grid = parseTerrainJson(JSON.stringify({ name: "hill", longitudeDeg: [10, 11], latitudeDeg: [20, 21], heightM: [[0, 100], [200, 300]] }));
    expect(grid.name).toBe("hill");
    expect(grid.heightM[1][1]).toBe(300);
  });

  it("parses unordered CSV long tables into ordered grids", () => {
    const grid = parseTerrainCsv("longitudeDeg,latitudeDeg,heightM\n11,21,300\n10,20,0\n11,20,100\n10,21,200\n");
    expect(grid.longitudeDeg).toEqual([10, 11]);
    expect(grid.latitudeDeg).toEqual([20, 21]);
    expect(grid.heightM).toEqual([[0, 100], [200, 300]]);
  });

  it("rejects duplicate and incomplete CSV grids", () => {
    expect(() => parseTerrainCsv("longitudeDeg,latitudeDeg,heightM\n10,20,0\n10,20,1\n11,20,2\n11,21,3\n")).toThrow(/重复/);
    expect(() => parseTerrainCsv("longitudeDeg,latitudeDeg,heightM\n10,20,0\n11,20,1\n10,21,2\n12,21,3\n")).toThrow(/缺少/);
  });
});

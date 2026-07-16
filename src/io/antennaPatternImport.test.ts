import { describe, expect, it } from "vitest";
import { parseAntennaPatternCsv, parseAntennaPatternJson } from "./antennaPatternImport";

describe("2D antenna pattern import", () => {
  it("imports a complete long-form CSV grid in sorted axis order", () => {
    const pattern = parseAntennaPatternCsv("azimuthDeg,elevationDeg,gainDb\n5,5,-2\n-5,-5,-2\n5,-5,-2\n-5,5,-2\n0,-5,-1\n0,5,-1\n-5,0,-1\n0,0,0\n5,0,-1\n");
    expect(pattern.azimuthAnglesDeg).toEqual([-5, 0, 5]);
    expect(pattern.elevationAnglesDeg).toEqual([-5, 0, 5]);
    expect(pattern.gainDb[1]).toEqual([-1, 0, -1]);
  });

  it("imports JSON grid metadata and rejects incomplete or non-monotonic grids", () => {
    expect(parseAntennaPatternJson(JSON.stringify({ name: "demo", azimuthAnglesDeg: [-1, 1], elevationAnglesDeg: [-2, 2], gainDb: [[-3, -3], [-3, 0]] })).name).toBe("demo");
    expect(() => parseAntennaPatternCsv("azimuthDeg,elevationDeg,gainDb\n-1,-1,0\n1,-1,-1\n-1,1,-1\n1,1,-1\n1,1,-2\n")).toThrow(/重复/);
    expect(() => parseAntennaPatternJson(JSON.stringify({ azimuthAnglesDeg: [0, -1], elevationAnglesDeg: [-1, 1], gainDb: [[0, 0], [0, 0]] }))).toThrow(/严格递增/);
  });
});

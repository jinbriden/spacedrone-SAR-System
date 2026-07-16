import { describe, expect, it } from "vitest";
import { parseSteeringTableCsv } from "./steeringTableImport";

describe("custom steering table CSV import", () => {
  it("解析严格递增的双轴角度时间表", () => {
    expect(parseSteeringTableCsv(
      "timeSeconds,azimuthDeg,elevationDeg\n0,-10,2\n5,0,-3\n10,20,4\n",
    )).toEqual([
      { timeSeconds: 0, azimuthDeg: -10, elevationDeg: 2 },
      { timeSeconds: 5, azimuthDeg: 0, elevationDeg: -3 },
      { timeSeconds: 10, azimuthDeg: 20, elevationDeg: 4 },
    ]);
  });

  it("拒绝字段缺失、非递增时间和越界角度", () => {
    expect(() => parseSteeringTableCsv("timeSeconds,azimuthDeg\n0,0\n1,1\n")).toThrow(/elevationDeg/);
    expect(() => parseSteeringTableCsv("timeSeconds,azimuthDeg,elevationDeg\n1,0,0\n1,2,3\n")).toThrow(/严格递增/);
    expect(() => parseSteeringTableCsv("timeSeconds,azimuthDeg,elevationDeg\n0,0,0\n1,90,0\n")).toThrow(/-89～89/);
  });
});

import { describe, expect, it } from "vitest";
import { parseAttitudeSequenceCsv } from "./attitudeSequenceImport";

describe("external attitude CSV import", () => {
  it("解析严格递增的 RPY 时间序列", () => {
    expect(parseAttitudeSequenceCsv(
      "timeSeconds,rollDeg,pitchDeg,yawDeg\n0,0,-2,170\n10,5,2,-170\n",
    )).toEqual([
      { timeSeconds: 0, rollDeg: 0, pitchDeg: -2, yawDeg: 170 },
      { timeSeconds: 10, rollDeg: 5, pitchDeg: 2, yawDeg: -170 },
    ]);
  });

  it("拒绝缺失字段、非递增时间和越界角度", () => {
    expect(() => parseAttitudeSequenceCsv("timeSeconds,rollDeg,pitchDeg\n0,0,0\n1,0,0\n")).toThrow(/yawDeg/);
    expect(() => parseAttitudeSequenceCsv("timeSeconds,rollDeg,pitchDeg,yawDeg\n1,0,0,0\n1,0,0,0\n")).toThrow(/严格递增/);
    expect(() => parseAttitudeSequenceCsv("timeSeconds,rollDeg,pitchDeg,yawDeg\n0,0,0,0\n1,181,0,0\n")).toThrow(/-180～180/);
  });
});

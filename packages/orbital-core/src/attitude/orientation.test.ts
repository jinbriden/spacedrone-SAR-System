import { describe, expect, it } from "vitest";
import { DEG_TO_RAD } from "../constants";
import { multiplyMatrixVector } from "../math/matrix3";
import { magnitude, subtract } from "../math/vector";
import {
  antennaBeamAxisLvlh,
  bodyDirectionToLvlh,
  bodyFromAntennaMatrix,
  bodyFromLvlhMatrix,
  bodyFromLvlhQuaternion,
} from "./orientation";

const zeroAngles = { rollRad: 0, pitchRad: 0, yawRad: 0 };

describe("body and antenna orientation", () => {
  it("零姿态时本体与 LVLH 重合，天线 +Za 指向天底 +Zs", () => {
    const bodyFromLvlh = bodyFromLvlhMatrix(zeroAngles);
    const bodyFromAntenna = bodyFromAntennaMatrix(zeroAngles);
    expect(bodyDirectionToLvlh([1, 0, 0], bodyFromLvlh)).toEqual([1, 0, 0]);
    expect(antennaBeamAxisLvlh(bodyFromLvlh, bodyFromAntenna)).toEqual([0, 0, 1]);
  });

  it("严格采用 Rz(yaw) Ry(pitch) Rx(roll) 顺序", () => {
    const matrix = bodyFromLvlhMatrix({
      rollRad: 90 * DEG_TO_RAD,
      pitchRad: 90 * DEG_TO_RAD,
      yawRad: 0,
    });
    const result = multiplyMatrixVector(matrix, [0, 0, 1]);
    expect(magnitude(subtract(result, [0, -1, 0]))).toBeLessThan(1e-12);
  });

  it("固定安装俯仰会使天线 +Za 在本体坐标中向 +X 偏转", () => {
    const bodyFromAntenna = bodyFromAntennaMatrix({
      rollRad: 0,
      pitchRad: 20 * DEG_TO_RAD,
      yawRad: 0,
    });
    const beam = antennaBeamAxisLvlh(
      bodyFromLvlhMatrix(zeroAngles),
      bodyFromAntenna,
    );
    expect(beam[0]).toBeCloseTo(Math.sin(20 * DEG_TO_RAD), 12);
    expect(beam[1]).toBeCloseTo(0, 12);
    expect(beam[2]).toBeCloseTo(Math.cos(20 * DEG_TO_RAD), 12);
  });

  it("姿态四元数采用 x/y/z/w 顺序且保持归一化", () => {
    expect(bodyFromLvlhQuaternion(zeroAngles)).toEqual([0, 0, 0, 1]);
    const quaternion = bodyFromLvlhQuaternion({
      rollRad: 23 * DEG_TO_RAD,
      pitchRad: -17 * DEG_TO_RAD,
      yawRad: 41 * DEG_TO_RAD,
    });
    expect(Math.hypot(...quaternion)).toBeCloseTo(1, 14);
  });
});

import { CallbackPositionProperty, CallbackProperty, Cartesian3, JulianDate } from "cesium";
import { describe, expect, it } from "vitest";
import { liveCartesianPosition, liveEcefPosition, liveProperty } from "./liveScene";

describe("live Cesium properties", () => {
  it("每帧读取最新 ECEF，而不是冻结在创建时的坐标", () => {
    const point = [1, 2, 3];
    const property = liveEcefPosition(() => point);
    const time = JulianDate.now();
    expect(property).toBeInstanceOf(CallbackPositionProperty);
    expect(property.isConstant).toBe(false);
    const first = property.getValue(time) as Cartesian3;
    expect([first.x, first.y, first.z]).toEqual([1, 2, 3]);
    point[0] = 9;
    const second = property.getValue(time) as Cartesian3;
    expect(second.x).toBe(9);
  });

  it("liveCartesianPosition 每帧克隆最新坐标", () => {
    let x = 4;
    const property = liveCartesianPosition(() => new Cartesian3(x, 0, 0));
    const time = JulianDate.now();
    expect(property.getValue(time)?.x).toBe(4);
    x = 8;
    expect(property.getValue(time)?.x).toBe(8);
  });

  it("liveProperty 标记为动态", () => {
    const property = liveProperty(() => 1);
    expect(property).toBeInstanceOf(CallbackProperty);
    expect(property.isConstant).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseTargetCsv, parseTargetGeoJson } from "./targetImport";

describe("target import", () => {
  it("导入带引号的 CSV 点目标", () => {
    const targets = parseTargetCsv(
      'name,longitudeDeg,latitudeDeg,altitudeM\n"香港, 目标",114.17,22.3,15\n',
    );
    expect(targets).toMatchObject([
      {
        id: "imported-target-1",
        name: "香港, 目标",
        targetType: "point",
        longitudeDeg: 114.17,
        latitudeDeg: 22.3,
        altitudeM: 15,
      },
    ]);
  });

  it("导入 GeoJSON Point 并忽略不支持的要素", () => {
    const targets = parseTargetGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          { type: "Feature", id: "a", properties: { name: "A" }, geometry: { type: "Point", coordinates: [10, 20, 30] } },
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        ],
      }),
    );
    expect(targets[0]).toMatchObject({ id: "a", name: "A", longitudeDeg: 10, latitudeDeg: 20, altitudeM: 30 });
  });

  it("字段缺失时给出具体字段名", () => {
    expect(() => parseTargetCsv("name,longitudeDeg\nA,1\n")).toThrow(/latitudeDeg/);
  });

  it("从 CSV 导入圆形、矩形和 JSON 顶点多边形", () => {
    const targets = parseTargetCsv('name,targetType,longitudeDeg,latitudeDeg,radiusM,widthM,heightM,vertices\nC,circle,10,20,50000,,,\nR,rectangle,11,21,,100000,80000,\nP,polygon,,,,,,"[[0,0],[1,0],[0,1]]"\n');
    expect(targets[0]).toMatchObject({ targetType: "circle", radiusM: 50_000 });
    expect(targets[1]).toMatchObject({ targetType: "rectangle", widthM: 100_000, heightM: 80_000 });
    expect(targets[2]).toMatchObject({ targetType: "polygon", latitudeDeg: 1 / 3 });
    expect(targets[2].longitudeDeg).toBeCloseTo(1 / 3, 4);
  });

  it("从 GeoJSON Polygon 导入任意多边形并去除闭合重复点", () => {
    const [target] = parseTargetGeoJson(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "区域" }, geometry: { type: "Polygon", coordinates: [[[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]] } }] }));
    expect(target.targetType).toBe("polygon");
    expect(target.vertices).toHaveLength(4);
    expect(Math.abs(target.longitudeDeg)).toBeCloseTo(180, 6);
  });
});

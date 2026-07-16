import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSceneFileJson } from "./sceneFile";
import { parseTargetCsv } from "./targetImport";
import { parseSteeringTableCsv } from "./steeringTableImport";
import { parseAttitudeSequenceCsv } from "./attitudeSequenceImport";
import { parseNaturalEarthBorderRings } from "../viewer/naturalEarthBorders";

describe("published example files", () => {
  it("内置国界 GeoJSON 可离线加载", () => {
    const json = readFileSync(
      new URL("../../public/data/ne_110m_admin_0_countries.geojson", import.meta.url),
      "utf8",
    );
    const data = JSON.parse(json) as { type?: string; features?: unknown[] };
    expect(data.type).toBe("FeatureCollection");
    expect(data.features?.length).toBeGreaterThan(150);
    const rings = parseNaturalEarthBorderRings(data);
    expect(rings).toHaveLength(289);
    expect(rings.reduce((count, ring) => count + ring.length, 0)).toBe(10_654);
  });

  it("公开场景示例符合当前 schemaVersion 1", () => {
    const json = readFileSync(
      new URL("../../public/examples/nadir-sine-scan.scene.json", import.meta.url),
      "utf8",
    );
    const file = parseSceneFileJson(json);
    expect(file.scene.orbit.mode).toBe("circular");
    expect(file.scene.antenna.scanMode).toBe("sine");
    expect(file.scene.targets).toHaveLength(1);
  });

  it("公开 CSV 模板可直接导入", () => {
    const csv = readFileSync(
      new URL("../../public/examples/targets.csv", import.meta.url),
      "utf8",
    );
    expect(parseTargetCsv(csv)).toHaveLength(3);
  });

  it("公开扫描时间表示例可直接导入", () => {
    const csv = readFileSync(
      new URL("../../public/examples/steering-table.csv", import.meta.url),
      "utf8",
    );
    expect(parseSteeringTableCsv(csv)).toHaveLength(5);
  });

  it("公开姿态序列示例可直接导入", () => {
    const csv = readFileSync(
      new URL("../../public/examples/attitude-sequence.csv", import.meta.url),
      "utf8",
    );
    expect(parseAttitudeSequenceCsv(csv)).toHaveLength(5);
  });
});

import { describe, expect, it } from "vitest";
import { defaultAntenna, defaultAttitude, defaultOrbit } from "../stores/simulationStore";
import { computeSimulationSamples } from "../workers/simulationSampling";
import { simulationSamplesToCsv, simulationSamplesToGeoJson } from "./dataExport";

describe("simulation export", () => {
  const result = computeSimulationSamples({
    orbit: defaultOrbit,
    attitude: defaultAttitude,
    antenna: defaultAntenna,
    includeCoverage: true,
    sampleCount: 3,
  });

  it("CSV 包含轨道、波束中心和覆盖区字段", () => {
    const csv = simulationSamplesToCsv(result);
    expect(csv).toContain("satelliteLongitudeDeg");
    expect(csv).toContain("beamCenterLongitudeDeg");
    expect(csv).toContain("velocityEciXMps");
    expect(csv).toContain("attitudeQuaternionW");
    expect(csv).toContain("incidenceAngleDeg");
    expect(csv).toContain("coverageAreaM2");
    expect(csv.split("\r\n")).toHaveLength(5);
  });

  it("GeoJSON 同时导出轨道、波束中心和闭合覆盖区", () => {
    const geoJson = JSON.parse(simulationSamplesToGeoJson(result));
    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.features.some((feature: any) => feature.properties.name === "satellite-ground-track")).toBe(true);
    expect(geoJson.features.some((feature: any) => feature.properties.name === "beam-center-track")).toBe(true);
    const polygon = geoJson.features.find((feature: any) => feature.geometry.type === "Polygon");
    expect(polygon.geometry.coordinates[0][0]).toEqual(polygon.geometry.coordinates[0].at(-1));
    expect(polygon.properties.slantRangeM).toBeGreaterThan(0);
  });

  it("多波束 GeoJSON 逐波束导出标识、颜色和相对功率", () => {
    const multi = computeSimulationSamples({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: {
        ...defaultAntenna,
        arrayFeeds: [{
          id: "feed-export", name: "导出馈源", enabled: true,
          offsetXM: 0, offsetYM: 0, offsetZM: 0,
          steeringAzimuthOffsetDeg: 5, steeringElevationOffsetDeg: 0,
          beamwidthScale: 1, relativePowerDb: -3, color: "#ff7875",
        }],
      },
      includeCoverage: true,
      sampleCount: 2,
    });
    const geoJson = JSON.parse(simulationSamplesToGeoJson(multi));
    const feedFeatures = geoJson.features.filter((feature: any) => feature.properties.beamId === "feed-export");
    expect(feedFeatures).toHaveLength(2);
    expect(feedFeatures[0].properties).toMatchObject({ beamName: "导出馈源", color: "#ff7875", relativePowerDb: -3 });
    expect(simulationSamplesToCsv(multi)).toContain("totalBeamCoverageAreaM2");
  });
});

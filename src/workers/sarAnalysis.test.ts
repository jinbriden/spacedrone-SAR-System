import { describe, expect, it } from "vitest";
import { defaultOrbit, defaultSar, type GroundTargetConfig } from "../stores/simulationStore";
import { computeSarAnalysis } from "./sarAnalysis";

describe("SAR orbital range analysis", () => {
  const target: GroundTargetConfig = {
    id: "sar-target", name: "SAR 目标", targetType: "point",
    longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
    radiusM: 0, widthM: 0, heightM: 0, vertices: [],
  };

  it("samples real orbit geometry at PRF cadence and reports closest range/Doppler", () => {
    const result = computeSarAnalysis({
      orbit: defaultOrbit,
      target,
      config: { ...defaultSar, targetId: target.id, analysisCenterSeconds: 1, apertureDurationSeconds: 0.02, prfHz: 1000 },
    });
    expect(result.history.samples).toHaveLength(21);
    expect(result.history.minimumRangeM).toBeGreaterThan(400_000);
    expect(result.history.maximumRangeM).toBeLessThan(700_000);
    expect(result.history.dopplerBandwidthHz).toBeGreaterThan(0);
    expect(result.history.fastTimeSampleCount).toBeGreaterThan(1);
    expect(result.startUtc).toMatch(/Z$/);
  });
});

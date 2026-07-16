import { describe, expect, it } from "vitest";
import { defaultOrbit, defaultSar, type GroundTargetConfig } from "../stores/simulationStore";
import { computeSarEcho } from "./sarEcho";

describe("SAR echo worker computation", () => {
  const target: GroundTargetConfig = {
    id: "echo-target", name: "回波目标", targetType: "point",
    longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
    radiusM: 0, widthM: 0, heightM: 0, vertices: [],
  };

  it("selects consecutive PRF pulses and creates a bounded complex matrix", () => {
    const result = computeSarEcho({
      orbit: defaultOrbit,
      target,
      config: {
        ...defaultSar,
        targetId: target.id,
        analysisCenterSeconds: 1,
        apertureDurationSeconds: 0.02,
        prfHz: 1000,
        chirpBandwidthHz: 1e6,
        samplingRateHz: 2e6,
        pulseWidthSeconds: 4e-6,
        fastTimeMarginSeconds: 1e-6,
        echoPulseCount: 8,
      },
    });
    expect(result.echo.pulseCount).toBe(8);
    expect(result.echo.inPhase.length).toBe(result.echo.pulseCount * result.echo.fastTimeSampleCount);
    expect(result.selectedPulseEndSeconds - result.selectedPulseStartSeconds).toBeCloseTo(7 / 1000, 12);
    expect(result.echo.ambiguity.rangeAmbiguous).toBe(true);
  });
});

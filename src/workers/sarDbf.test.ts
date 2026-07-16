import { describe, expect, it } from "vitest";
import { defaultOrbit, defaultSar, type GroundTargetConfig } from "../stores/simulationStore";
import { computeSarDbfAnalysis } from "./sarDbf";

describe("SAR multi-channel DBF worker", () => {
  const target: GroundTargetConfig = {
    id: "dbf-target", name: "DBF 目标", targetType: "point",
    longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
    radiusM: 0, widthM: 0, heightM: 0, vertices: [],
  };

  it("generates channel cube, DBF echo and reconstructed spectrum", () => {
    const result = computeSarDbfAnalysis({
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
        receiveChannelCount: 3,
        receiveChannelSpacingM: 4,
        multiChannelPulseCount: 16,
      },
    });
    expect(result.multiChannelEcho.channelCount).toBe(3);
    expect(result.multiChannelEcho.pulseCount).toBe(16);
    expect(result.dbf.inPhase).toHaveLength(16 * result.multiChannelEcho.fastTimeSampleCount);
    expect(result.spectrum.frequencyHz).toHaveLength(16 * 3);
    expect(result.spectrum.minimumPivotMagnitude).toBeGreaterThan(1e-10);
  });
});

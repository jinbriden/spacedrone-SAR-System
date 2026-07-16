import { describe, expect, it } from "vitest";
import { defaultOrbit, defaultSar, type GroundTargetConfig } from "../stores/simulationStore";
import { computeSarImaging } from "./sarImaging";

describe("SAR imaging worker", () => {
  const target: GroundTargetConfig = {
    id: "image-target", name: "成像目标", targetType: "point",
    longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0,
    radiusM: 0, widthM: 0, heightM: 0, vertices: [],
  };

  it("runs the registered reference imager on real orbit echo", () => {
    const result = computeSarImaging({
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
        echoPulseCount: 16,
        imagingMaximumRangePixels: 64,
      },
    });
    expect(result.image.algorithmId).toBe("reference-range-backprojection");
    expect(result.image.azimuthPixelCount).toBe(16);
    expect(result.image.intensityDb).toHaveLength(result.image.azimuthPixelCount * result.image.rangePixelCount);
    expect(result.image.intensityDb[result.image.peakAzimuthIndex * result.image.rangePixelCount + result.image.peakRangeIndex]).toBeCloseTo(0, 5);
  });
});

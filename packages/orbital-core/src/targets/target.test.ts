import { describe, expect, it } from "vitest";
import { DEG_TO_RAD, WGS84_SEMI_MAJOR_AXIS_M } from "../constants";
import { computeBeamFootprint } from "../coverage/footprint";
import { geodeticToEcef } from "../coordinates/geodetic";
import { sampleCircularBeamBoundary } from "../antenna/beam";
import type { Vector3 } from "../types";
import { evaluateGroundTarget, pointInProjectedFootprint } from "./target";

function antennaToEcef(direction: Vector3): Vector3 {
  return [-direction[2], direction[0], direction[1]];
}

describe("ground target observation", () => {
  const satellite = [WGS84_SEMI_MAJOR_AXIS_M + 500_000, 0, 0] as const;
  const footprint = computeBeamFootprint({
    originEcefM: satellite,
    centerDirectionEcef: [-1, 0, 0],
    boundaryDirectionsEcef: sampleCircularBeamBoundary({
      steeringAzimuthRad: 0,
      steeringElevationRad: 0,
      fullBeamwidthRad: 6 * DEG_TO_RAD,
      sampleCount: 96,
    }).map(antennaToEcef),
    alongTrackAxisEcef: [0, 0, 1],
    crossTrackAxisEcef: [0, 1, 0],
  });
  const ecefFromAntenna = [0, 0, -1, 1, 0, 0, 0, 1, 0] as const;

  it("星下点可见且位于天底覆盖区内", () => {
    const target = [WGS84_SEMI_MAJOR_AXIS_M, 0, 0] as const;
    const result = evaluateGroundTarget({
      targetEcefM: target,
      satelliteEcefM: satellite,
      footprint,
      alongTrackAxisEcef: [0, 0, 1],
      crossTrackAxisEcef: [0, 1, 0],
      ecefFromAntenna,
      steeringAzimuthRad: 0,
      steeringElevationRad: 0,
    });
    expect(result.visibleAboveHorizon).toBe(true);
    expect(result.insideFootprint).toBe(true);
    expect(result.slantRangeM).toBeCloseTo(500_000, 6);
    expect(result.azimuthDeviationRad).toBeCloseTo(0, 12);
    expect(result.elevationDeviationRad).toBeCloseTo(0, 12);
  });

  it("覆盖区外点不命中，地球背面点不可见", () => {
    const outside = geodeticToEcef({ longitudeRad: 1 * DEG_TO_RAD, latitudeRad: 0, altitudeM: 0 });
    expect(pointInProjectedFootprint(outside, footprint, [0, 0, 1], [0, 1, 0])).toBe(false);
    const farSide = [-WGS84_SEMI_MAJOR_AXIS_M, 0, 0] as const;
    const result = evaluateGroundTarget({
      targetEcefM: farSide,
      satelliteEcefM: satellite,
      footprint,
      alongTrackAxisEcef: [0, 0, 1],
      crossTrackAxisEcef: [0, 1, 0],
      ecefFromAntenna,
      steeringAzimuthRad: 0,
      steeringElevationRad: 0,
    });
    expect(result.visibleAboveHorizon).toBe(false);
    expect(result.insideFootprint).toBe(false);
  });
});

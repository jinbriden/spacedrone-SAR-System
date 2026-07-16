import { describe, expect, it } from "vitest";
import { defaultAntenna, defaultAttitude, defaultOrbit, defaultTerrain, type GroundTargetConfig } from "../stores/simulationStore";
import { computeSceneGeometry } from "./sceneGeometry";
import { computeTargetObservations } from "./targetObservation";

function target(overrides: Partial<GroundTargetConfig>): GroundTargetConfig {
  return { id: "target", name: "目标", targetType: "point", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [], ...overrides };
}

describe("task region observation", () => {
  it("区域边界与波束相交时命中，即使区域中心不在覆盖区", () => {
    const scene = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna: defaultAntenna, elapsedSeconds: 0 });
    const centerPoint = target({ longitudeDeg: 67.55 });
    const circle = target({ id: "circle", targetType: "circle", longitudeDeg: 67.55, radiusM: 30_000 });
    const [pointState, circleState] = computeTargetObservations(scene, [centerPoint, circle]);
    expect(pointState.observation.insideFootprint).toBe(false);
    expect(circleState.observation.insideFootprint).toBe(true);
    expect(circleState.regionBoundary).toHaveLength(64);
  });

  it("远离波束的多边形区域不命中", () => {
    const scene = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna: defaultAntenna, elapsedSeconds: 0 });
    const polygon = target({ targetType: "polygon", longitudeDeg: 80, vertices: [{ longitudeDeg: 79, latitudeDeg: -1 }, { longitudeDeg: 81, latitudeDeg: -1 }, { longitudeDeg: 80, latitudeDeg: 1 }] });
    expect(computeTargetObservations(scene, [polygon])[0].observation.insideFootprint).toBe(false);
  });

  it("目标与卫星之间的高地会覆盖解析地平线可见结果", () => {
    const terrain = {
      ...defaultTerrain,
      enabled: true,
      lineOfSightEnabled: true,
      lineOfSightSampleSpacingM: 1000,
      grid: {
        name: "高地",
        longitudeDeg: [66, 68, 70, 72, 74],
        latitudeDeg: [-1, 0, 1],
        heightM: Array.from({ length: 3 }, () => Array(5).fill(100_000)),
      },
    };
    const scene = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna: defaultAntenna, terrain, elapsedSeconds: 0 });
    const state = computeTargetObservations(scene, [target({ longitudeDeg: 72 })], terrain)[0];
    expect(state.terrainOccluded).toBe(true);
    expect(state.terrainLineOfSight?.clear).toBe(false);
    expect(state.observation.visibleAboveHorizon).toBe(false);
    expect(state.observation.insideFootprint).toBe(false);
  });

  it("主波束未命中时附加馈源可形成多波束联合命中", () => {
    const offAxisTarget = target({ longitudeDeg: 67.55 });
    const tracking = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, taskMode: "spotlight", spotlightTargetId: offAxisTarget.id },
      targets: [offAxisTarget],
      elapsedSeconds: 0,
    });
    const multiBeam = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: {
        ...defaultAntenna,
        arrayFeeds: [{
          id: "target-feed", name: "目标馈源", enabled: true,
          offsetXM: 0, offsetYM: 0, offsetZM: 0,
          steeringAzimuthOffsetDeg: tracking.coverage.requestedSteering.azimuthRad * 180 / Math.PI,
          steeringElevationOffsetDeg: tracking.coverage.requestedSteering.elevationRad * 180 / Math.PI,
          beamwidthScale: 1, relativePowerDb: 0, color: "#ff7875",
        }],
      },
      elapsedSeconds: 0,
    });
    const state = computeTargetObservations(multiBeam, [offAxisTarget])[0];
    expect(state.beamObservations[0].observation.insideFootprint).toBe(false);
    expect(state.beamObservations[1].observation.insideFootprint).toBe(true);
    expect(state.observation.insideFootprint).toBe(true);
    expect(state.illuminatingBeamIds).toEqual(["target-feed"]);
    expect(state.selectedBeamName).toBe("目标馈源");
  });
});

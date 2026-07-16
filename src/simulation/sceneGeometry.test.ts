import { describe, expect, it } from "vitest";
import { defaultAntenna, defaultAttitude, defaultOrbit, defaultTerrain } from "../stores/simulationStore";
import { computeSceneGeometry } from "./sceneGeometry";

describe("scene geometry antenna engineering parameters", () => {
  it("天线本体 Z 偏移真实改变射线原点和天底斜距", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, mountOffsetZM: 1000 },
      elapsedSeconds: 0,
    });
    expect(scene.coverage.centerIntersection?.distanceM).toBeCloseTo(499_000, 2);
    const offset = Math.hypot(
      scene.coverage.originEcefM[0] - scene.satellite.positionEcefM[0],
      scene.coverage.originEcefM[1] - scene.satellite.positionEcefM[1],
      scene.coverage.originEcefM[2] - scene.satellite.positionEcefM[2],
    );
    expect(offset).toBeCloseTo(1000, 9);
  });

  it("请求扫描角超过机械限制时饱和到最大扫描角", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, steeringAzimuthDeg: 40, maxScanAngleDeg: 12 },
      elapsedSeconds: 0,
    });
    expect(scene.coverage.effectiveSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(12, 12);
    expect(scene.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(40, 12);
  });

  it("自定义扫描时间表通过统一几何链线性驱动双轴指向", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: {
        ...defaultAntenna,
        scanMode: "custom",
        steeringTable: [
          { timeSeconds: 0, azimuthDeg: -10, elevationDeg: 4 },
          { timeSeconds: 10, azimuthDeg: 20, elevationDeg: -6 },
        ],
      },
      elapsedSeconds: 5,
    });
    expect(scene.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(5, 12);
    expect(scene.coverage.requestedSteering.elevationRad * 180 / Math.PI).toBeCloseTo(-1, 12);
  });

  it("外部姿态序列通过统一几何链驱动有效本体姿态", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: {
        ...defaultAttitude,
        mode: "external",
        sequence: [
          { timeSeconds: 0, rollDeg: 0, pitchDeg: -4, yawDeg: 10 },
          { timeSeconds: 10, rollDeg: 10, pitchDeg: 6, yawDeg: 30 },
        ],
      },
      antenna: defaultAntenna,
      elapsedSeconds: 5,
    });
    expect(scene.attitude.effectiveEulerRad.rollRad * 180 / Math.PI).toBeCloseTo(5, 12);
    expect(scene.attitude.effectiveEulerRad.pitchRad * 180 / Math.PI).toBeCloseTo(1, 12);
    expect(scene.attitude.effectiveEulerRad.yawRad * 180 / Math.PI).toBeCloseTo(20, 12);
  });

  it("Stripmap 忽略通用周期扫描并保持固定条带指向", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, taskMode: "stripmap", scanMode: "sine", steeringAzimuthDeg: 7, steeringElevationDeg: -3, scanAmplitudeDeg: 20, scanPeriodSeconds: 40 },
      elapsedSeconds: 10,
    });
    expect(scene.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(7, 12);
    expect(scene.coverage.requestedSteering.elevationRad * 180 / Math.PI).toBeCloseTo(-3, 12);
  });

  it("ScanSAR 按 burst 顺序循环切换子测绘带", () => {
    const antenna = { ...defaultAntenna, taskMode: "scanSar" as const, steeringAzimuthDeg: 4, scanSarElevationAnglesDeg: [-18, 0, 18], scanSarBurstDurationSeconds: 5 };
    const first = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna, elapsedSeconds: 4.999 });
    const second = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna, elapsedSeconds: 5 });
    const fourth = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna, elapsedSeconds: 15 });
    expect(first.coverage.requestedSteering.elevationRad * 180 / Math.PI).toBeCloseTo(-18, 12);
    expect(second.coverage.requestedSteering.elevationRad * 180 / Math.PI).toBeCloseTo(0, 12);
    expect(fourth.coverage.requestedSteering.elevationRad * 180 / Math.PI).toBeCloseTo(-18, 12);
  });

  it("TOPS 在每个单程周期内线性扫掠并复位", () => {
    const antenna = { ...defaultAntenna, taskMode: "tops" as const, topsStartAzimuthDeg: -20, topsEndAzimuthDeg: 20, topsSweepDurationSeconds: 10 };
    const middle = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna, elapsedSeconds: 5 });
    const reset = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna, elapsedSeconds: 10 });
    expect(middle.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(0, 12);
    expect(reset.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(-20, 12);
  });

  it("Spotlight 持续把波束中心指向所选地面目标", () => {
    const target = { id: "spotlight-target", name: "跟踪点", targetType: "point" as const, longitudeDeg: 68.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] };
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, taskMode: "spotlight", spotlightTargetId: target.id },
      targets: [target],
      elapsedSeconds: 0,
    });
    expect(scene.coverage.taskModeWarning).toBeUndefined();
    expect(scene.coverage.centerGeodetic).toBeDefined();
    expect(scene.coverage.centerGeodetic!.longitudeRad * 180 / Math.PI).toBeCloseTo(target.longitudeDeg, 5);
    expect(scene.coverage.centerGeodetic!.latitudeRad * 180 / Math.PI).toBeCloseTo(target.latitudeDeg, 5);
  });

  it("Spotlight 目标缺失时显示诊断并回退手动固定指向", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: { ...defaultAntenna, taskMode: "spotlight", spotlightTargetId: "missing", steeringAzimuthDeg: 6 },
      targets: [],
      elapsedSeconds: 0,
    });
    expect(scene.coverage.taskModeWarning).toMatch(/未找到/);
    expect(scene.coverage.requestedSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(6, 12);
  });

  it("二维方向图门限通过统一射线链生成覆盖区，10 dB 面积大于 3 dB", () => {
    const gainPattern = {
      name: "test-pattern",
      azimuthAnglesDeg: [-10, -5, 0, 5, 10],
      elevationAnglesDeg: [-10, -5, 0, 5, 10],
      gainDb: [-10, -5, 0, 5, 10].map((elevation) => [-10, -5, 0, 5, 10].map((azimuth) => -(azimuth * azimuth + elevation * elevation) / 25)),
    };
    const scene3Db = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna: { ...defaultAntenna, beamType: "pattern", gainPattern, patternThresholdDbBelowPeak: 3 }, elapsedSeconds: 0 });
    const scene10Db = computeSceneGeometry({ orbit: defaultOrbit, attitude: defaultAttitude, antenna: { ...defaultAntenna, beamType: "pattern", gainPattern, patternThresholdDbBelowPeak: 10 }, elapsedSeconds: 0 });
    expect(scene3Db.coverage.isClosed).toBe(true);
    expect(scene3Db.coverage.patternPeakGainDb).toBe(0);
    expect(scene3Db.coverage.patternThresholdGainDb).toBe(-3);
    expect(scene10Db.coverage.localProjectedAreaM2!).toBeGreaterThan(scene3Db.coverage.localProjectedAreaM2!);
  });

  it("启用 DEM 后波束中心和边界落在数字高程面", () => {
    const terrain = {
      ...defaultTerrain,
      enabled: true,
      grid: {
        name: "平坦 1000 m",
        longitudeDeg: [60, 67.5, 75],
        latitudeDeg: [-10, 0, 10],
        heightM: [[1000, 1000, 1000], [1000, 1000, 1000], [1000, 1000, 1000]],
      },
    };
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: defaultAntenna,
      terrain,
      elapsedSeconds: 0,
    });
    expect(scene.coverage.centerGeodetic?.altitudeM).toBeCloseTo(1000, 0);
    expect(scene.coverage.terrainIntersectionCount).toBeGreaterThan(0);
    expect(scene.coverage.terrainFallbackCount).toBe(0);
  });

  it("附加馈源生成独立相位中心、指向和波束宽度", () => {
    const scene = computeSceneGeometry({
      orbit: defaultOrbit,
      attitude: defaultAttitude,
      antenna: {
        ...defaultAntenna,
        arrayFeeds: [{
          id: "wide-feed", name: "宽波束馈源", enabled: true,
          offsetXM: 12, offsetYM: -3, offsetZM: 2,
          steeringAzimuthOffsetDeg: 8, steeringElevationOffsetDeg: -2,
          beamwidthScale: 2, relativePowerDb: -1.5, color: "#ff7875",
        }],
      },
      elapsedSeconds: 0,
    });
    expect(scene.beams).toHaveLength(2);
    const [primary, feed] = scene.beams;
    expect(feed.effectiveSteering.azimuthRad * 180 / Math.PI).toBeCloseTo(8, 12);
    expect(feed.effectiveSteering.elevationRad * 180 / Math.PI).toBeCloseTo(-2, 12);
    expect(Math.hypot(
      feed.originEcefM[0] - primary.originEcefM[0],
      feed.originEcefM[1] - primary.originEcefM[1],
      feed.originEcefM[2] - primary.originEcefM[2],
    )).toBeCloseTo(Math.sqrt(157), 9);
    expect(feed.localProjectedAreaM2!).toBeGreaterThan(primary.localProjectedAreaM2!);
    expect(feed.relativePowerDb).toBe(-1.5);
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultAntenna,
  defaultAttitude,
  defaultMissionSettings,
  defaultOrbit,
  defaultDisplaySettings,
  defaultTerrain,
  defaultSar,
  type SceneSnapshot,
} from "../stores/simulationStore";
import { parseSceneFile, parseSceneFileJson, serializeSceneFile } from "./sceneFile";

function exampleScene(): SceneSnapshot {
  return {
    orbit: { ...defaultOrbit },
    attitude: { ...defaultAttitude },
    antenna: { ...defaultAntenna, scanMode: "sine" },
    targets: [{ id: "target-1", name: "赤道目标", targetType: "point", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] }],
    missionSettings: { ...defaultMissionSettings },
    timelineSettings: { startSeconds: 0, endSeconds: 6000 },
    displaySettings: { ...defaultDisplaySettings },
    elapsedSeconds: 12,
    playbackRate: 10,
    targetPasses: {
      "target-1": {
        firstEntrySeconds: 0,
        currentEntrySeconds: 0,
        lastExitSeconds: undefined,
        cumulativeIlluminationSeconds: 12,
        lastSampleSeconds: 12,
        wasInside: true,
      },
    },
    coverageHistory: [
      { timeSeconds: 0, verticesEcefM: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    ],
    companionSatellites: [],
    taskRequirements: {},
    terrain: { ...defaultTerrain },
    sar: { ...defaultSar },
  };
}

describe("scene file schema", () => {
  it("保存并加载后恢复同一场景", () => {
    const scene = exampleScene();
    const file = parseSceneFileJson(serializeSceneFile(scene, "2026-07-15T00:00:00.000Z"));
    expect(file.schemaVersion).toBe(1);
    expect(file.scene).toEqual(scene);
  });

  it("对缺失版本给出迁移提示", () => {
    expect(() => parseSceneFile({ kind: "spacedrone.scene", scene: {} })).toThrow(/schemaVersion.*迁移/);
  });

  it("拒绝字段缺失、非法单位范围和重复目标", () => {
    const valid = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete valid.scene.orbit.epochUtc;
    expect(() => parseSceneFile(valid)).toThrow(/epochUtc/);

    const invalidLatitude = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    invalidLatitude.scene.targets[0].latitudeDeg = 91;
    expect(() => parseSceneFile(invalidLatitude)).toThrow(/latitudeDeg/);

    const duplicate = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    duplicate.scene.targets.push({ ...duplicate.scene.targets[0] });
    expect(() => parseSceneFile(duplicate)).toThrow(/重复/);
  });

  it("旧版版本 1 场景缺少新增显示字段时使用兼容默认值", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.displaySettings.showEarthReferences;
    delete legacy.scene.displaySettings.lightingEnabled;
    delete legacy.scene.displaySettings.satelliteScale;
    delete legacy.scene.displaySettings.showEarthTexture;
    delete legacy.scene.displaySettings.showBorders;
    delete legacy.scene.displaySettings.satelliteModelUrl;
    const parsed = parseSceneFile(legacy);
    expect(parsed.scene.displaySettings).toMatchObject({
      showEarthReferences: false,
      lightingEnabled: false,
      satelliteScale: 1,
      showEarthTexture: true,
      showBorders: true,
      satelliteModelUrl: "",
    });
  });

  it("旧点目标缺少区域字段时自动迁移为 point", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    for (const key of ["targetType", "radiusM", "widthM", "heightM", "vertices"]) delete legacy.scene.targets[0][key];
    expect(parseSceneFile(legacy).scene.targets[0]).toMatchObject({ targetType: "point", radiusM: 0, widthM: 0, heightM: 0, vertices: [] });
  });

  it("旧场景缺少传播模型时回退二体，并可往返保存 J2 选择", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.orbit.propagationModel;
    expect(parseSceneFile(legacy).scene.orbit.propagationModel).toBe("twoBody");

    const j2Scene = exampleScene();
    j2Scene.orbit.propagationModel = "j2Secular";
    expect(parseSceneFileJson(serializeSceneFile(j2Scene)).scene.orbit.propagationModel).toBe("j2Secular");
  });

  it("TLE / SGP4 场景可往返保存，并拒绝传播模型错配和损坏校验和", () => {
    const tleScene = exampleScene();
    tleScene.orbit = {
      ...tleScene.orbit,
      mode: "tle",
      propagationModel: "sgp4",
      tleName: "VANGUARD 1",
      tleLine1: "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
      tleLine2: "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667",
      epochUtc: "2000-06-27T18:50:19.733Z",
    };
    expect(parseSceneFileJson(serializeSceneFile(tleScene)).scene.orbit).toEqual(tleScene.orbit);

    const mismatch = JSON.parse(serializeSceneFile(tleScene)) as Record<string, any>;
    mismatch.scene.orbit.propagationModel = "twoBody";
    expect(() => parseSceneFile(mismatch)).toThrow(/TLE.*SGP4/);

    const invalid = JSON.parse(serializeSceneFile(tleScene)) as Record<string, any>;
    invalid.scene.orbit.tleLine2 = invalid.scene.orbit.tleLine2.slice(0, -1) + "2";
    expect(() => parseSceneFile(invalid)).toThrow(/校验和/);
  });

  it("伴飞星完整配置可往返保存，旧场景回退为空列表并拒绝重复 ID", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.companionSatellites;
    expect(parseSceneFile(legacy).scene.companionSatellites).toEqual([]);

    const constellation = exampleScene();
    constellation.companionSatellites = [{
      id: "sat-2", name: "SAT-2", color: "#ff7875", enabled: true,
      orbit: { ...defaultOrbit, raanDeg: 120, initialPhaseDeg: 120 },
      attitude: { ...defaultAttitude, rollDeg: 2 },
      antenna: { ...defaultAntenna, steeringElevationDeg: 10 },
    }];
    expect(parseSceneFileJson(serializeSceneFile(constellation)).scene.companionSatellites).toEqual(constellation.companionSatellites);

    const duplicate = JSON.parse(serializeSceneFile(constellation)) as Record<string, any>;
    duplicate.scene.companionSatellites.push({ ...duplicate.scene.companionSatellites[0] });
    expect(() => parseSceneFile(duplicate)).toThrow(/ID 重复/);
  });

  it("旧场景缺少任务模式时回退通用模式，并可往返保存 ScanSAR 参数", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    for (const key of ["taskMode", "spotlightTargetId", "scanSarElevationAnglesDeg", "scanSarBurstDurationSeconds", "topsStartAzimuthDeg", "topsEndAzimuthDeg", "topsSweepDurationSeconds"]) {
      delete legacy.scene.antenna[key];
    }
    expect(parseSceneFile(legacy).scene.antenna).toMatchObject({ taskMode: "generic", scanSarElevationAnglesDeg: [-20, 0, 20] });

    const scanSar = exampleScene();
    scanSar.antenna = { ...scanSar.antenna, taskMode: "scanSar", scanSarElevationAnglesDeg: [-15, 5, 22], scanSarBurstDurationSeconds: 8 };
    expect(parseSceneFileJson(serializeSceneFile(scanSar)).scene.antenna).toEqual(scanSar.antenna);
  });

  it("旧场景缺少方向图字段时使用兼容默认值，并可往返保存二维网格", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.antenna.gainPattern;
    delete legacy.scene.antenna.patternThresholdDbBelowPeak;
    expect(parseSceneFile(legacy).scene.antenna).toMatchObject({ gainPattern: null, patternThresholdDbBelowPeak: 3 });

    const patternScene = exampleScene();
    patternScene.antenna = {
      ...patternScene.antenna,
      beamType: "pattern",
      patternThresholdDbBelowPeak: 10,
      gainPattern: { name: "grid", azimuthAnglesDeg: [-5, 5], elevationAnglesDeg: [-4, 4], gainDb: [[-12, -8], [-9, 0]] },
    };
    expect(parseSceneFileJson(serializeSceneFile(patternScene)).scene.antenna).toEqual(patternScene.antenna);
  });

  it("旧场景缺少累计覆盖显示方式时回退轨迹带，并可保存几何并集模式", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.missionSettings.historyDisplayMode;
    expect(parseSceneFile(legacy).scene.missionSettings.historyDisplayMode).toBe("footprints");

    const unionScene = exampleScene();
    unionScene.missionSettings.historyDisplayMode = "union";
    expect(parseSceneFileJson(serializeSceneFile(unionScene)).scene.missionSettings.historyDisplayMode).toBe("union");
  });

  it("旧场景缺少重访设置时使用兼容默认值，并可往返保存自定义分析参数", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    for (const key of ["revisitStartSeconds", "revisitEndSeconds", "revisitSampleStepSeconds", "revisitTransitionToleranceSeconds"]) delete legacy.scene.missionSettings[key];
    expect(parseSceneFile(legacy).scene.missionSettings).toMatchObject({
      revisitStartSeconds: 0, revisitEndSeconds: 86_400, revisitSampleStepSeconds: 5, revisitTransitionToleranceSeconds: 0.1,
    });

    const custom = exampleScene();
    custom.missionSettings = { ...custom.missionSettings, revisitStartSeconds: 100, revisitEndSeconds: 9000, revisitSampleStepSeconds: 2, revisitTransitionToleranceSeconds: 0.05 };
    expect(parseSceneFileJson(serializeSceneFile(custom)).scene.missionSettings).toEqual(custom.missionSettings);
  });

  it("任务规划约束可往返保存，旧场景回退默认设置并拒绝未知目标", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.taskRequirements;
    for (const key of ["taskPlanStartSeconds", "taskPlanEndSeconds", "taskPlanSampleStepSeconds", "taskPlanTransitionToleranceSeconds"]) delete legacy.scene.missionSettings[key];
    const migrated = parseSceneFile(legacy).scene;
    expect(migrated.taskRequirements).toEqual({});
    expect(migrated.missionSettings).toMatchObject({ taskPlanStartSeconds: 0, taskPlanEndSeconds: 86_400, taskPlanSampleStepSeconds: 10, taskPlanTransitionToleranceSeconds: 0.1 });

    const planned = exampleScene();
    planned.taskRequirements = { "target-1": { targetId: "target-1", enabled: true, priority: 9, requiredDurationSeconds: 120, earliestStartSeconds: 100, latestEndSeconds: 5000, minimumSegmentSeconds: 20, allowSplit: false } };
    expect(parseSceneFileJson(serializeSceneFile(planned)).scene.taskRequirements).toEqual(planned.taskRequirements);

    const invalid = JSON.parse(serializeSceneFile(planned)) as Record<string, any>;
    invalid.scene.taskRequirements.missing = { ...invalid.scene.taskRequirements["target-1"], targetId: "missing" };
    expect(() => parseSceneFile(invalid)).toThrow(/不存在的目标/);
  });

  it("DEM 地形配置可往返保存，旧场景回退关闭状态并拒绝启用空网格", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.terrain;
    expect(parseSceneFile(legacy).scene.terrain).toEqual(defaultTerrain);

    const terrainScene = exampleScene();
    terrainScene.terrain = {
      ...defaultTerrain, enabled: true, lineOfSightSampleSpacingM: 250, opacity: 0.7,
      grid: { name: "hill", longitudeDeg: [10, 11], latitudeDeg: [20, 21], heightM: [[0, 100], [200, 300]] },
    };
    expect(parseSceneFileJson(serializeSceneFile(terrainScene)).scene.terrain).toEqual(terrainScene.terrain);

    const invalid = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    invalid.scene.terrain.enabled = true;
    invalid.scene.terrain.grid = null;
    expect(() => parseSceneFile(invalid)).toThrow(/grid 不能为空/);
  });

  it("Spotlight 场景只接受存在的目标引用", () => {
    const spotlight = exampleScene();
    spotlight.antenna = { ...spotlight.antenna, taskMode: "spotlight", spotlightTargetId: "target-1" };
    expect(parseSceneFileJson(serializeSceneFile(spotlight)).scene.antenna.spotlightTargetId).toBe("target-1");

    const invalid = JSON.parse(serializeSceneFile(spotlight)) as Record<string, any>;
    invalid.scene.antenna.spotlightTargetId = "missing-target";
    expect(() => parseSceneFile(invalid)).toThrow(/spotlightTargetId.*存在/);
  });

  it("自定义扫描时间表可往返保存并拒绝空表模式", () => {
    const scene = exampleScene();
    scene.antenna.scanMode = "custom";
    scene.antenna.steeringTable = [
      { timeSeconds: 0, azimuthDeg: -5, elevationDeg: 2 },
      { timeSeconds: 10, azimuthDeg: 5, elevationDeg: -2 },
    ];
    expect(parseSceneFileJson(serializeSceneFile(scene)).scene.antenna.steeringTable).toEqual(scene.antenna.steeringTable);

    const invalid = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    invalid.scene.antenna.scanMode = "custom";
    invalid.scene.antenna.steeringTable = [];
    expect(() => parseSceneFile(invalid)).toThrow(/至少包含 2/);
  });

  it("旧场景缺少姿态来源时回退固定模式，并可往返保存外部序列", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.attitude.mode;
    delete legacy.scene.attitude.sequence;
    expect(parseSceneFile(legacy).scene.attitude).toMatchObject({ mode: "fixed", sequence: [] });

    const external = exampleScene();
    external.attitude = {
      ...external.attitude,
      mode: "external",
      sequence: [
        { timeSeconds: 0, rollDeg: 0, pitchDeg: 0, yawDeg: 170 },
        { timeSeconds: 10, rollDeg: 5, pitchDeg: 2, yawDeg: -170 },
      ],
    };
    expect(parseSceneFileJson(serializeSceneFile(external)).scene.attitude).toEqual(external.attitude);

    external.attitude.sequence = [];
    expect(() => serializeSceneFile(external)).toThrow(/至少包含 2/);
  });

  it("旧场景缺少姿态限制时使用默认值，并拒绝外部序列角速度超限", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    for (const key of ["maxRollDeg", "maxPitchDeg", "maxYawDeg", "maxAngularRateDegS", "maxAngularAccelerationDegS2"]) delete legacy.scene.attitude[key];
    expect(parseSceneFile(legacy).scene.attitude).toMatchObject({ maxRollDeg: 180, maxPitchDeg: 180, maxYawDeg: 180, maxAngularRateDegS: 30, maxAngularAccelerationDegS2: 10 });

    const invalid = exampleScene();
    invalid.attitude = {
      ...invalid.attitude,
      mode: "external",
      maxAngularRateDegS: 10,
      sequence: [
        { timeSeconds: 0, rollDeg: 0, pitchDeg: 0, yawDeg: 0 },
        { timeSeconds: 1, rollDeg: 0, pitchDeg: 0, yawDeg: 100 },
      ],
    };
    expect(() => serializeSceneFile(invalid)).toThrow(/角速度/);
  });

  it("自定义姿态限制可随场景往返保存", () => {
    const scene = exampleScene();
    scene.attitude = { ...scene.attitude, maxRollDeg: 20, maxPitchDeg: 15, maxYawDeg: 45, maxAngularRateDegS: 5, maxAngularAccelerationDegS2: 2 };
    expect(parseSceneFileJson(serializeSceneFile(scene)).scene.attitude).toEqual(scene.attitude);
  });

  it("阵列馈源可往返保存，旧场景迁移为空阵列并拒绝重复 ID", () => {
    const legacy = JSON.parse(serializeSceneFile(exampleScene())) as Record<string, any>;
    delete legacy.scene.antenna.arrayFeeds;
    expect(parseSceneFile(legacy).scene.antenna.arrayFeeds).toEqual([]);

    const scene = exampleScene();
    scene.antenna.arrayFeeds = [{
      id: "feed-1", name: "FEED-1", enabled: true,
      offsetXM: 0.1, offsetYM: -0.2, offsetZM: 0.3,
      steeringAzimuthOffsetDeg: 6, steeringElevationOffsetDeg: -3,
      beamwidthScale: 1.2, relativePowerDb: -2, color: "#ff7875",
    }];
    expect(parseSceneFileJson(serializeSceneFile(scene)).scene.antenna.arrayFeeds).toEqual(scene.antenna.arrayFeeds);

    const invalid = JSON.parse(serializeSceneFile(scene)) as Record<string, any>;
    invalid.scene.antenna.arrayFeeds.push({ ...invalid.scene.antenna.arrayFeeds[0] });
    expect(() => parseSceneFile(invalid)).toThrow(/ID 必须唯一/);
  });
});

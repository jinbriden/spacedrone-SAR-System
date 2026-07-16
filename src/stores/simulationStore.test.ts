import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultAntenna,
  defaultAttitude,
  defaultMissionSettings,
  defaultOrbit,
  defaultDisplaySettings,
  useSimulationStore,
  type SceneSnapshot,
} from "./simulationStore";
import { DEG_TO_RAD, geodeticToEcef } from "@spacedrone/orbital-core";

describe("simulation store scene lifecycle", () => {
  beforeEach(() => useSimulationStore.getState().newScene());

  it("加载时恢复参数、时间、目标统计和累计扫描带", () => {
    const scene: SceneSnapshot = {
      orbit: { ...defaultOrbit, altitudeM: 700_000 },
      attitude: { ...defaultAttitude, rollDeg: 3 },
      antenna: { ...defaultAntenna, scanMode: "linear" },
      targets: [{ id: "t1", name: "T1", targetType: "point", longitudeDeg: 10, latitudeDeg: 20, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] }],
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { startSeconds: 0, endSeconds: 6000 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 25,
      playbackRate: 10,
      targetPasses: {
        t1: {
          firstEntrySeconds: 2,
          lastExitSeconds: 8,
          cumulativeIlluminationSeconds: 6,
          lastSampleSeconds: 25,
          wasInside: false,
        },
      },
      coverageHistory: [
        { timeSeconds: 20, verticesEcefM: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
      ],
    };
    useSimulationStore.getState().loadScene(scene);
    const state = useSimulationStore.getState();
    expect(state.orbit).toEqual(scene.orbit);
    expect(state.orbitDraft).toEqual(scene.orbit);
    expect(state.elapsedSeconds).toBe(25);
    expect(state.targetPasses).toEqual(scene.targetPasses);
    expect(state.coverageHistory).toEqual(scene.coverageHistory);
    expect(state.playing).toBe(false);
  });

  it("新建场景恢复默认值并清除任务状态", () => {
    useSimulationStore.setState({ elapsedSeconds: 99, targets: [{ id: "x", name: "X", targetType: "point", longitudeDeg: 0, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] }] });
    useSimulationStore.getState().newScene();
    const state = useSimulationStore.getState();
    expect(state.elapsedSeconds).toBe(0);
    expect(state.targets).toEqual([]);
    expect(state.orbit).toEqual(defaultOrbit);
    expect(state.coverageHistory).toEqual([]);
    expect(state.companionSatellites).toEqual([]);
  });

  it("可从主星克隆、独立修改和删除伴飞星", () => {
    const store = useSimulationStore.getState();
    store.addCompanionSatellite();
    const companion = useSimulationStore.getState().companionSatellites[0];
    expect(companion).toMatchObject({ name: "SAT-2", enabled: true });
    expect(companion.orbit.initialPhaseDeg).not.toBe(defaultOrbit.initialPhaseDeg);
    store.updateCompanionSatellite(companion.id, { name: "伴飞星 A", enabled: false, orbit: { ...companion.orbit, raanDeg: 45 } });
    expect(useSimulationStore.getState().companionSatellites[0]).toMatchObject({ name: "伴飞星 A", enabled: false, orbit: { raanDeg: 45 } });
    store.removeCompanionSatellite(companion.id);
    expect(useSimulationStore.getState().companionSatellites).toEqual([]);
  });

  it("删除目标时同步删除其任务规划约束", () => {
    useSimulationStore.setState({ targets: [{ id: "task-target", name: "任务目标", targetType: "point", longitudeDeg: 0, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] }] });
    useSimulationStore.getState().updateTaskRequirement("task-target", { enabled: true, priority: 9 });
    expect(useSimulationStore.getState().taskRequirements["task-target"]).toMatchObject({ enabled: true, priority: 9 });
    useSimulationStore.getState().removeTarget("task-target");
    expect(useSimulationStore.getState().taskRequirements).toEqual({});
  });

  it("播放、单步和轨道应用均受时间轴范围约束", () => {
    const store = useSimulationStore.getState();
    store.updateTimelineSettings({ startSeconds: 10, endSeconds: 20 });
    store.setElapsedSeconds(19);
    useSimulationStore.setState({ playing: true, playbackRate: 10 });
    useSimulationStore.getState().advanceByRealTime(1);
    expect(useSimulationStore.getState()).toMatchObject({ elapsedSeconds: 20, playing: false });
    useSimulationStore.getState().step(5);
    expect(useSimulationStore.getState().elapsedSeconds).toBe(20);
    useSimulationStore.getState().applyOrbit();
    expect(useSimulationStore.getState().elapsedSeconds).toBe(10);
  });

  it("暂停状态不会随真实时间推进", () => {
    useSimulationStore.setState({ elapsedSeconds: 12, playing: false, playbackRate: 1000 });
    useSimulationStore.getState().advanceByRealTime(30);
    expect(useSimulationStore.getState().elapsedSeconds).toBe(12);
  });

  it("切换相机模式只改变显示状态，不修改物理参数", () => {
    const before = useSimulationStore.getState();
    const physical = {
      orbit: before.orbit,
      attitude: before.attitude,
      antenna: before.antenna,
      elapsedSeconds: before.elapsedSeconds,
    };
    before.updateDisplaySettings({ cameraMode: "satellite" });
    expect(useSimulationStore.getState()).toMatchObject(physical);
  });

  it("几何并集模式从累计 ECEF 覆盖帧生成合并区域并在清除时重置", () => {
    const footprint = (west: number, east: number) => [
      geodeticToEcef({ longitudeRad: west * DEG_TO_RAD, latitudeRad: 0, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: east * DEG_TO_RAD, latitudeRad: 0, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: east * DEG_TO_RAD, latitudeRad: DEG_TO_RAD, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: west * DEG_TO_RAD, latitudeRad: DEG_TO_RAD, altitudeM: 0 }),
    ];
    useSimulationStore.getState().updateMissionSettings({ historyDisplayMode: "union" });
    useSimulationStore.getState().processMissionSamples([
      { timeSeconds: 0, targetInsideById: {}, footprintVerticesEcefM: footprint(0, 2) },
      { timeSeconds: 10, targetInsideById: {}, footprintVerticesEcefM: footprint(1, 3) },
    ]);
    expect(useSimulationStore.getState().coverageHistory).toHaveLength(2);
    expect(useSimulationStore.getState().coverageUnion).toHaveLength(1);
    useSimulationStore.getState().clearCoverageHistory();
    expect(useSimulationStore.getState().coverageUnion).toEqual([]);
  });

  it("同一时刻的多波束历史保存在一个采样帧并全部进入几何并集", () => {
    const footprint = (west: number, east: number) => [
      geodeticToEcef({ longitudeRad: west * DEG_TO_RAD, latitudeRad: 0, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: east * DEG_TO_RAD, latitudeRad: 0, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: east * DEG_TO_RAD, latitudeRad: DEG_TO_RAD, altitudeM: 0 }),
      geodeticToEcef({ longitudeRad: west * DEG_TO_RAD, latitudeRad: DEG_TO_RAD, altitudeM: 0 }),
    ];
    const primary = footprint(0, 1);
    const secondary = footprint(3, 4);
    useSimulationStore.getState().updateMissionSettings({ historyDisplayMode: "union" });
    useSimulationStore.getState().processMissionSamples([{
      timeSeconds: 0,
      targetInsideById: {},
      footprintVerticesEcefM: primary,
      beamFootprints: [
        { beamId: "primary", beamName: "主波束", color: "#fadb14", verticesEcefM: primary },
        { beamId: "feed-2", beamName: "FEED-2", color: "#ff7875", verticesEcefM: secondary },
      ],
    }]);
    expect(useSimulationStore.getState().coverageHistory).toHaveLength(1);
    expect(useSimulationStore.getState().coverageHistory[0].beamFootprints).toHaveLength(2);
    expect(useSimulationStore.getState().coverageUnion).toHaveLength(2);
  });
});

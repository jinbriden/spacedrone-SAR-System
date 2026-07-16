import {
  defaultAntenna,
  defaultAttitude,
  defaultMissionSettings,
  defaultOrbit,
  defaultDisplaySettings,
  type SceneSnapshot,
} from "../stores/simulationStore";

export interface ExampleScene {
  key: string;
  name: string;
  description: string;
  scene: SceneSnapshot;
}

const exampleGainPattern = {
  name: "非对称椭圆主瓣",
  azimuthAnglesDeg: [-12, -8, -4, 0, 4, 8, 12],
  elevationAnglesDeg: [-8, -4, 0, 4, 8],
  gainDb: [-8, -4, 0, 4, 8].map((elevation) =>
    [-12, -8, -4, 0, 4, 8, 12].map((azimuth) => -(
      ((azimuth - 1) / 7) ** 2 * 3 + ((elevation + 0.5) / 4.5) ** 2 * 3
    )),
  ),
};

export const EXAMPLE_SCENES: ExampleScene[] = [
  {
    key: "nadir-sine",
    name: "天底正弦扫描",
    description: "500 km 太阳同步近似轨道、方位向 ±20° 正弦扫描和赤道目标。",
    scene: {
      orbit: { ...defaultOrbit },
      attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, scanMode: "sine", scanAmplitudeDeg: 20, scanPeriodSeconds: 60 },
      targets: [
        { id: "example-equator-target", name: "初始星下点", targetType: "point", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] },
      ],
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { startSeconds: 0, endSeconds: 6000 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 100,
      targetPasses: {},
      coverageHistory: [],
    },
  },
  {
    key: "rectangular-linear",
    name: "矩形波束线性扫描",
    description: "矩形角域波束沿俯仰轴进行 ±12° 线性往返扫描。",
    scene: {
      orbit: { ...defaultOrbit, altitudeM: 650_000, inclinationDeg: 55 },
      attitude: { ...defaultAttitude, yawDeg: 5 },
      antenna: {
        ...defaultAntenna,
        beamType: "rectangular",
        azimuthBeamwidthDeg: 5,
        elevationBeamwidthDeg: 9,
        scanMode: "linear",
        scanAxis: "elevation",
        scanAmplitudeDeg: 12,
        scanPeriodSeconds: 80,
      },
      targets: [
        { id: "example-hong-kong", name: "香港", targetType: "point", longitudeDeg: 114.17, latitudeDeg: 22.3, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] },
        { id: "example-singapore", name: "新加坡", targetType: "point", longitudeDeg: 103.82, latitudeDeg: 1.35, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] },
      ],
      missionSettings: { ...defaultMissionSettings, historySampleIntervalSeconds: 5 },
      timelineSettings: { startSeconds: 0, endSeconds: 7200 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 100,
      targetPasses: {},
      coverageHistory: [],
    },
  },
  {
    key: "custom-steering-table",
    name: "自定义双轴时间表",
    description: "按 0～120 s 双轴角度表线性插值，范围外保持端点指向。",
    scene: {
      orbit: { ...defaultOrbit, altitudeM: 550_000, semiMajorAxisM: defaultOrbit.semiMajorAxisM + 50_000 },
      attitude: { ...defaultAttitude },
      antenna: {
        ...defaultAntenna,
        scanMode: "custom",
        steeringTable: [
          { timeSeconds: 0, azimuthDeg: -20, elevationDeg: 0 },
          { timeSeconds: 30, azimuthDeg: 0, elevationDeg: 5 },
          { timeSeconds: 60, azimuthDeg: 20, elevationDeg: 0 },
          { timeSeconds: 90, azimuthDeg: 0, elevationDeg: -5 },
          { timeSeconds: 120, azimuthDeg: -20, elevationDeg: 0 },
        ],
      },
      targets: [],
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { startSeconds: 0, endSeconds: 600 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 10,
      targetPasses: {},
      coverageHistory: [],
    },
  },
  {
    key: "j2-nodal-drift",
    name: "J2 升交点漂移",
    description: "500 km、97.4° 近太阳同步轨道，展示约 +1 deg/day 的 RAAN 长期漂移。",
    scene: {
      orbit: { ...defaultOrbit, propagationModel: "j2Secular" },
      attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna },
      targets: [],
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { startSeconds: 0, endSeconds: 172_800 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 1000,
      targetPasses: {},
      coverageHistory: [],
    },
  },
  {
    key: "vanguard-sgp4",
    name: "Vanguard 1 TLE / SGP4",
    description: "使用 NORAD 00005 验证 TLE，从 TLE 历元开始执行 SGP4 近地传播。",
    scene: {
      orbit: {
        ...defaultOrbit,
        mode: "tle",
        propagationModel: "sgp4",
        tleName: "VANGUARD 1",
        tleLine1: "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
        tleLine2: "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667",
        epochUtc: "2000-06-27T18:50:19.733Z",
      },
      attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna }, targets: [],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 15_960 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 100, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "three-satellite-constellation",
    name: "三卫星同轨编队",
    description: "三颗卫星在同一 500 km 轨道面按 120° 相位间隔运行，并联合分析赤道任务区重访。",
    scene: {
      orbit: { ...defaultOrbit, initialPhaseDeg: 0 },
      attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna, circularBeamwidthDeg: 12 },
      companionSatellites: [
        { id: "constellation-sat-2", name: "SAT-2", color: "#ff7875", enabled: true, orbit: { ...defaultOrbit, initialPhaseDeg: 120 }, attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna, circularBeamwidthDeg: 12 } },
        { id: "constellation-sat-3", name: "SAT-3", color: "#95de64", enabled: true, orbit: { ...defaultOrbit, initialPhaseDeg: 240 }, attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna, circularBeamwidthDeg: 12 } },
      ],
      targets: [{ id: "constellation-region", name: "赤道任务区", targetType: "circle", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 1_000_000, widthM: 0, heightM: 0, vertices: [] }],
      taskRequirements: { "constellation-region": { targetId: "constellation-region", enabled: true, priority: 8, requiredDurationSeconds: 300, earliestStartSeconds: 0, latestEndSeconds: 86_400, minimumSegmentSeconds: 30, allowSplit: true } },
      missionSettings: { ...defaultMissionSettings, revisitSampleStepSeconds: 10 },
      timelineSettings: { startSeconds: 0, endSeconds: 10_000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 100, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "external-attitude",
    name: "外部姿态序列",
    description: "按 0～120 s RPY 时间序列沿各轴最短角路径插值，并驱动本体与天线姿态。",
    scene: {
      orbit: { ...defaultOrbit },
      attitude: {
        ...defaultAttitude,
        mode: "external",
        sequence: [
          { timeSeconds: 0, rollDeg: -10, pitchDeg: 0, yawDeg: 170 },
          { timeSeconds: 30, rollDeg: 0, pitchDeg: 5, yawDeg: 180 },
          { timeSeconds: 60, rollDeg: 10, pitchDeg: 0, yawDeg: -170 },
          { timeSeconds: 90, rollDeg: 0, pitchDeg: -5, yawDeg: -160 },
          { timeSeconds: 120, rollDeg: -10, pitchDeg: 0, yawDeg: -150 },
        ],
      },
      antenna: { ...defaultAntenna },
      targets: [],
      missionSettings: { ...defaultMissionSettings },
      timelineSettings: { startSeconds: 0, endSeconds: 600 },
      displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0,
      playbackRate: 10,
      targetPasses: {},
      coverageHistory: [],
    },
  },
  {
    key: "stripmap",
    name: "Stripmap 固定条带",
    description: "固定 12° 横向指向，在轨道推进过程中形成连续条带。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, taskMode: "stripmap", steeringElevationDeg: 12 }, targets: [],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 100, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "spotlight",
    name: "Spotlight 目标跟踪",
    description: "波束随卫星运动持续跟踪初始星下点东侧 1° 的地面目标。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, taskMode: "spotlight", spotlightTargetId: "example-spotlight-target" },
      targets: [{ id: "example-spotlight-target", name: "Spotlight 跟踪点", targetType: "point", longitudeDeg: 68.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] }],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "scansar",
    name: "ScanSAR 三子带",
    description: "每 8 s 在 -18°、0°、18° 三个俯仰子测绘带间循环切换。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, taskMode: "scanSar", scanSarElevationAnglesDeg: [-18, 0, 18], scanSarBurstDurationSeconds: 8 }, targets: [],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "tops",
    name: "TOPS 方位扫掠",
    description: "方位角每 20 s 从 -20° 线性扫到 +20° 后复位。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, taskMode: "tops", topsStartAzimuthDeg: -20, topsEndAzimuthDeg: 20, topsSweepDurationSeconds: 20 }, targets: [],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "gain-pattern",
    name: "二维方向图 3 dB 覆盖",
    description: "导入式非对称椭圆增益网格，按相对峰值 -3 dB 主瓣生成覆盖区。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, beamType: "pattern", gainPattern: exampleGainPattern, patternThresholdDbBelowPeak: 3 }, targets: [],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "coverage-union",
    name: "累计覆盖几何并集",
    description: "以 5 s 间隔采样正弦扫描覆盖区，并实时合并重叠区域与独立区域。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: { ...defaultAntenna, scanMode: "sine", scanAmplitudeDeg: 18, scanPeriodSeconds: 60 }, targets: [],
      missionSettings: { ...defaultMissionSettings, historyDisplayMode: "union", historySampleIntervalSeconds: 5, maxHistoryFootprints: 240 },
      timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 100, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "three-beam-array",
    name: "三馈源并行多波束",
    description: "中心馈源与 ±6° 方位偏置馈源同时成像，显示独立相位中心、覆盖区和联合目标命中。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude },
      antenna: {
        ...defaultAntenna,
        circularBeamwidthDeg: 5,
        arrayFeeds: [
          { id: "feed-left", name: "FEED-L", enabled: true, offsetXM: -0.25, offsetYM: 0, offsetZM: 0, steeringAzimuthOffsetDeg: -6, steeringElevationOffsetDeg: 0, beamwidthScale: 1, relativePowerDb: -1, color: "#ff7875" },
          { id: "feed-right", name: "FEED-R", enabled: true, offsetXM: 0.25, offsetYM: 0, offsetZM: 0, steeringAzimuthOffsetDeg: 6, steeringElevationOffsetDeg: 0, beamwidthScale: 1, relativePowerDb: -1, color: "#95de64" },
        ],
      },
      targets: [
        { id: "beam-center-target", name: "中心波束目标", targetType: "point", longitudeDeg: 67.1379, latitudeDeg: 0, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [] },
      ],
      missionSettings: { ...defaultMissionSettings, historyEnabled: true, historySampleIntervalSeconds: 5, historyDisplayMode: "union" },
      timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
  {
    key: "task-regions",
    name: "多类型任务区域",
    description: "同时显示圆形、矩形和任意多边形区域，并按区域与波束真实相交更新照射状态。",
    scene: {
      orbit: { ...defaultOrbit }, attitude: { ...defaultAttitude }, antenna: { ...defaultAntenna },
      targets: [
        { id: "region-circle", name: "圆形区域", targetType: "circle", longitudeDeg: 67.55, latitudeDeg: 0, altitudeM: 0, radiusM: 30_000, widthM: 0, heightM: 0, vertices: [] },
        { id: "region-rectangle", name: "矩形区域", targetType: "rectangle", longitudeDeg: 66.65, latitudeDeg: 0.15, altitudeM: 0, radiusM: 0, widthM: 70_000, heightM: 45_000, vertices: [] },
        { id: "region-polygon", name: "任意多边形", targetType: "polygon", longitudeDeg: 67.15, latitudeDeg: -0.55, altitudeM: 0, radiusM: 0, widthM: 0, heightM: 0, vertices: [{ longitudeDeg: 66.85, latitudeDeg: -0.75 }, { longitudeDeg: 67.45, latitudeDeg: -0.7 }, { longitudeDeg: 67.55, latitudeDeg: -0.35 }, { longitudeDeg: 66.95, latitudeDeg: -0.3 }] },
      ],
      missionSettings: { ...defaultMissionSettings }, timelineSettings: { startSeconds: 0, endSeconds: 6000 }, displaySettings: { ...defaultDisplaySettings },
      elapsedSeconds: 0, playbackRate: 10, targetPasses: {}, coverageHistory: [],
    },
  },
];

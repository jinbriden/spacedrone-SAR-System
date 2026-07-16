import { Alert, Button, Dropdown, Modal, Select, Space, Tooltip } from "antd";
import { useMemo, useRef, useState } from "react";
import { EXAMPLE_SCENES } from "../examples/exampleScenes";
import { downloadTextFile, timestampedFileName } from "../io/browserFiles";
import { simulationSamplesToCsv, simulationSamplesToGeoJson } from "../io/dataExport";
import { parseSceneFileJson, serializeSceneFile } from "../io/sceneFile";
import { parseTargetFile } from "../io/targetImport";
import { useSimulationStore, type SceneSnapshot } from "../stores/simulationStore";
import { runSimulationSamplingWorker } from "../workers/simulationWorkerClient";

interface Feedback {
  type: "success" | "error" | "info";
  text: string;
}

export function DataToolbar() {
  const orbit = useSimulationStore((state) => state.orbit);
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const companionSatellites = useSimulationStore((state) => state.companionSatellites);
  const taskRequirements = useSimulationStore((state) => state.taskRequirements);
  const terrain = useSimulationStore((state) => state.terrain);
  const sar = useSimulationStore((state) => state.sar);
  const targets = useSimulationStore((state) => state.targets);
  const missionSettings = useSimulationStore((state) => state.missionSettings);
  const timelineSettings = useSimulationStore((state) => state.timelineSettings);
  const displaySettings = useSimulationStore((state) => state.displaySettings);
  const updateDisplaySettings = useSimulationStore((state) => state.updateDisplaySettings);
  const requestCameraReset = useSimulationStore((state) => state.requestCameraReset);
  const requestScreenshot = useSimulationStore((state) => state.requestScreenshot);
  const elapsedSeconds = useSimulationStore((state) => state.elapsedSeconds);
  const playbackRate = useSimulationStore((state) => state.playbackRate);
  const targetPasses = useSimulationStore((state) => state.targetPasses);
  const coverageHistory = useSimulationStore((state) => state.coverageHistory);
  const loadScene = useSimulationStore((state) => state.loadScene);
  const newScene = useSimulationStore((state) => state.newScene);
  const addTargets = useSimulationStore((state) => state.addTargets);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [exporting, setExporting] = useState<"csv" | "geojson">();
  const [modal, modalContext] = Modal.useModal();

  const scene = useMemo<SceneSnapshot>(() => ({
    orbit,
    attitude,
    antenna,
    targets,
    missionSettings,
    timelineSettings,
    displaySettings,
    companionSatellites,
    taskRequirements,
    terrain,
    sar,
    elapsedSeconds,
    playbackRate,
    targetPasses,
    coverageHistory,
  }), [antenna, attitude, companionSatellites, coverageHistory, displaySettings, elapsedSeconds, missionSettings, orbit, playbackRate, sar, targetPasses, targets, taskRequirements, terrain, timelineSettings]);

  const save = () => {
    downloadTextFile(
      timestampedFileName("spacedrone-scene", "json"),
      serializeSceneFile(scene),
      "application/json",
    );
    setFeedback({ type: "success", text: "场景 JSON 已保存。" });
  };

  const readScene = async (file: File) => {
    try {
      const parsed = parseSceneFileJson(await file.text());
      loadScene(parsed.scene);
      setFeedback({ type: "success", text: `已加载 ${file.name}（schemaVersion 1）。` });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "场景加载失败。" });
    }
  };

  const importTargets = async (file: File) => {
    try {
      const imported = parseTargetFile(await file.text(), file.name);
      addTargets(imported);
      setFeedback({ type: "success", text: `已从 ${file.name} 导入 ${imported.length} 个点目标。` });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "目标导入失败。" });
    }
  };

  const exportSimulation = async (format: "csv" | "geojson") => {
    setExporting(format);
    setFeedback({ type: "info", text: "正在 Worker 中采样一周轨道与覆盖区…" });
    try {
      const result = await runSimulationSamplingWorker({
        orbit,
        attitude,
        antenna,
        targets,
        terrain,
        includeCoverage: true,
        sampleCount: 361,
      });
      const isCsv = format === "csv";
      downloadTextFile(
        timestampedFileName("spacedrone-orbit-coverage", format),
        isCsv ? simulationSamplesToCsv(result) : simulationSamplesToGeoJson(result),
        isCsv ? "text/csv" : "application/geo+json",
      );
      setFeedback({ type: "success", text: `已导出 361 个固定时间采样点的 ${format.toUpperCase()}。` });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "数据导出失败。" });
    } finally {
      setExporting(undefined);
    }
  };

  return (
    <div className="data-toolbar">
      {modalContext}
      <Space wrap size={[6, 6]}>
        <Button size="small" onClick={() => modal.confirm({
          title: "新建场景？",
          content: "当前未保存的参数、目标和累计统计将被清除。",
          okText: "新建",
          cancelText: "取消",
          onOk: () => {
            newScene();
            setFeedback({ type: "success", text: "已新建默认场景。" });
          },
        })}>新建场景</Button>
        <Button size="small" onClick={save}>保存场景</Button>
        <Button size="small" onClick={() => sceneInputRef.current?.click()}>加载场景</Button>
        <Button size="small" onClick={() => targetInputRef.current?.click()}>导入目标</Button>
        <Tooltip title="在 Web Worker 中采样一周轨道、波束中心和覆盖区">
          <Button size="small" loading={exporting === "csv"} disabled={exporting !== undefined} onClick={() => void exportSimulation("csv")}>导出 CSV</Button>
        </Tooltip>
        <Tooltip title="导出地面航迹、波束中心轨迹和每个闭合覆盖多边形">
          <Button size="small" loading={exporting === "geojson"} disabled={exporting !== undefined} onClick={() => void exportSimulation("geojson")}>导出 GeoJSON</Button>
        </Tooltip>
        <Dropdown
          menu={{
            items: EXAMPLE_SCENES.map((example) => ({ key: example.key, label: example.name })),
            onClick: ({ key }) => {
              const example = EXAMPLE_SCENES.find((item) => item.key === key);
              if (!example) return;
              loadScene(example.scene);
              setFeedback({ type: "success", text: `已载入示例：${example.name}。${example.description}` });
            },
          }}
        >
          <Button size="small">示例场景</Button>
        </Dropdown>
        <Select
          size="small"
          aria-label="相机模式"
          value={displaySettings.cameraMode}
          style={{ width: 116 }}
          options={[
            { value: "free", label: "自由视角" },
            { value: "satellite", label: "跟随卫星" },
            { value: "subpoint", label: "跟随星下点" },
            { value: "beamCenter", label: "跟随波束" },
          ]}
          onChange={(cameraMode) => updateDisplaySettings({ cameraMode })}
        />
        <Button size="small" onClick={requestCameraReset}>重置相机</Button>
        <Button size="small" onClick={() => {
          requestScreenshot();
          setFeedback({ type: "info", text: "截图请求已发送，完成后浏览器将下载当前三维视图 PNG。" });
        }}>截图</Button>
        <Button size="small" onClick={() => modal.info({
          title: "操作帮助",
          width: 620,
          okText: "知道了",
          content: (
            <div className="help-content">
              <p>拖动/滚轮控制地球；单击读取经纬高，双击定位；点击卫星进入跟随视角。</p>
              <p>轨道参数点击“应用并重新初始化”后生效，姿态、天线与显示参数实时生效。</p>
              <p>多星编队从主星克隆伴飞星；伴飞星轨道独立传播，重访分析同时给出逐星和星座联合窗口。</p>
              <p>任务规划会为每个启用目标计算临时 Spotlight 机会窗口，再按优先级和卫星独占约束生成计划，可导出任务、计划段和机会窗口 CSV。</p>
              <p>场景 JSON 使用 schemaVersion 1；目标导入支持 CSV 点/圆/矩形/多边形，以及 GeoJSON Point/Polygon。</p>
              <p>自定义扫描时间表 CSV 使用 timeSeconds,azimuthDeg,elevationDeg 表头，并按时间线性插值。</p>
              <p>外部姿态 CSV 使用 timeSeconds,rollDeg,pitchDeg,yawDeg 表头，各轴沿最短角路径插值。</p>
              <p>若出现 WebGL 错误，请启用浏览器硬件加速、更新显卡驱动并重新加载页面。</p>
            </div>
          ),
        })}>帮助</Button>
      </Space>
      {feedback && (
        <Alert
          className="toolbar-feedback"
          type={feedback.type}
          title={feedback.text}
          closable
          onClose={() => setFeedback(undefined)}
        />
      )}
      <input
        hidden
        ref={sceneInputRef}
        className="hidden-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readScene(file);
          event.currentTarget.value = "";
        }}
      />
      <input
        hidden
        ref={targetInputRef}
        className="hidden-file-input"
        type="file"
        accept=".csv,.geojson,application/geo+json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importTargets(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

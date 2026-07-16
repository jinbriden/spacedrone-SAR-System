import { ConfigProvider, Divider, Typography, theme } from "antd";
import { useSimulationClock } from "./hooks/useSimulationClock";
import { useMissionSampler } from "./hooks/useMissionSampler";
import { OrbitPanel } from "./panels/OrbitPanel";
import { AttitudeAntennaPanel } from "./panels/AttitudeAntennaPanel";
import { TargetPanel } from "./panels/TargetPanel";
import { StatusPanel } from "./panels/StatusPanel";
import { TimelineControls } from "./panels/TimelineControls";
import { GlobeViewer } from "./viewer/GlobeViewer";
import { DataToolbar } from "./components/DataToolbar";
import { DisplayPanel } from "./panels/DisplayPanel";
import { MissionAnalysisPanel } from "./panels/MissionAnalysisPanel";
import { ConstellationPanel } from "./panels/ConstellationPanel";
import { TaskPlanningPanel } from "./panels/TaskPlanningPanel";
import { TerrainPanel } from "./panels/TerrainPanel";
import { ArrayFeedPanel } from "./panels/ArrayFeedPanel";
import { SarAnalysisPanel } from "./panels/SarAnalysisPanel";

const { Text, Title } = Typography;

export default function App() {
  useSimulationClock();
  useMissionSampler();
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#25a7d9", borderRadius: 6 },
      }}
    >
      <main className="app-shell">
        <header className="topbar">
          <div>
            <Title level={3}>星载对地扫描三维仿真平台</Title>
            <Text type="secondary">多星轨道 · 波束覆盖 · 重访分析 · 场景工程化</Text>
          </div>
          <div className="model-badge">WGS84 · 多星 · Web Worker · schemaVersion 1 · CSV / GeoJSON</div>
          <DataToolbar />
        </header>
        <div className="workspace">
          <aside className="sidebar left-sidebar">
            <OrbitPanel />
            <Divider />
            <ConstellationPanel />
            <Divider />
            <AttitudeAntennaPanel />
            <Divider />
            <ArrayFeedPanel />
            <Divider />
            <TargetPanel />
            <Divider />
            <TerrainPanel />
            <Divider />
            <MissionAnalysisPanel />
            <Divider />
            <TaskPlanningPanel />
            <Divider />
            <SarAnalysisPanel />
            <Divider />
            <DisplayPanel />
          </aside>
          <section className="viewer-container">
            <GlobeViewer />
            <div className="viewer-legend">
              <span><i className="legend-line dashed" />LVLH 轴</span>
              <span><i className="legend-line solid" />本体轴（X/Y/Z：红/绿/蓝）</span>
              <span><i className="legend-line beam" />天线 +Za</span>
              <span><i className="legend-swatch footprint" />瞬时覆盖区</span>
              <span><i className="legend-swatch history" />累计扫描带</span>
            </div>
          </section>
          <aside className="sidebar right-sidebar">
            <StatusPanel />
          </aside>
        </div>
        <TimelineControls />
      </main>
    </ConfigProvider>
  );
}

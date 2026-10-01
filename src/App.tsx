import { ConfigProvider, Typography, theme } from "antd";
import { DataToolbar } from "./components/DataToolbar";
import { WorkspaceBody } from "./components/WorkspaceBody";
import { useMissionSampler } from "./hooks/useMissionSampler";
import { useSimulationClock } from "./hooks/useSimulationClock";
import { TimelineControls } from "./panels/TimelineControls";

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
          <div className="topbar-title">
            <Title level={3}>星载对地扫描三维仿真平台</Title>
            <Text type="secondary">轨道 · 覆盖 · 重访 · SAR</Text>
          </div>
          <DataToolbar />
        </header>
        <WorkspaceBody />
        <TimelineControls />
      </main>
    </ConfigProvider>
  );
}

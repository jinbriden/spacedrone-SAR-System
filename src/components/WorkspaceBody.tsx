import { useCallback, useState } from "react";
import { ArrayFeedPanel } from "../panels/ArrayFeedPanel";
import { AttitudeAntennaPanel } from "../panels/AttitudeAntennaPanel";
import { ConstellationPanel } from "../panels/ConstellationPanel";
import { DisplayPanel } from "../panels/DisplayPanel";
import { MissionAnalysisPanel } from "../panels/MissionAnalysisPanel";
import { OrbitPanel } from "../panels/OrbitPanel";
import { SarAnalysisPanel } from "../panels/SarAnalysisPanel";
import { StatusPanel } from "../panels/StatusPanel";
import { TargetPanel } from "../panels/TargetPanel";
import { TaskPlanningPanel } from "../panels/TaskPlanningPanel";
import { TerrainPanel } from "../panels/TerrainPanel";
import { GlobeViewer } from "../viewer/GlobeViewer";
import {
  DEFAULT_WORKSPACE_MODE,
  WORKSPACE_MODES,
  type WorkspaceModeId,
} from "../workspace/modes";

function panelHidden(active: WorkspaceModeId, id: WorkspaceModeId): boolean {
  return active !== id;
}

export function WorkspaceBody() {
  const [mode, setMode] = useState<WorkspaceModeId>(DEFAULT_WORKSPACE_MODE);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(() => (
    typeof window === "undefined" ? true : window.innerWidth > 1100
  ));

  const selectMode = useCallback((next: WorkspaceModeId) => {
    if (mode === next && leftOpen) {
      setLeftOpen(false);
      return;
    }
    setMode(next);
    setLeftOpen(true);
  }, [leftOpen, mode]);

  return (
    <div className={`workspace${leftOpen ? "" : " workspace-left-collapsed"}${rightOpen ? "" : " workspace-right-collapsed"}`}>
      <div className="workspace-left">
        <nav className="workspace-rail" aria-label="工作区">
          {WORKSPACE_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`workspace-rail-button${mode === item.id && leftOpen ? " active" : ""}`}
              title={item.hint}
              aria-pressed={mode === item.id && leftOpen}
              onClick={() => selectMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <aside className="sidebar left-sidebar" hidden={!leftOpen} aria-hidden={!leftOpen}>
          <div hidden={panelHidden(mode, "orbit")}>
            <OrbitPanel />
            <ConstellationPanel />
          </div>
          <div hidden={panelHidden(mode, "attitude")}>
            <AttitudeAntennaPanel />
            <ArrayFeedPanel />
          </div>
          <div hidden={panelHidden(mode, "targets")}>
            <TargetPanel />
            <TerrainPanel />
          </div>
          <div hidden={panelHidden(mode, "mission")}>
            <MissionAnalysisPanel />
            <TaskPlanningPanel />
          </div>
          <div hidden={panelHidden(mode, "sar")}>
            <SarAnalysisPanel />
          </div>
          <div hidden={panelHidden(mode, "display")}>
            <DisplayPanel />
          </div>
        </aside>
      </div>
      <section className="viewer-container">
        <button
          type="button"
          className="sidebar-edge-toggle left"
          aria-label={leftOpen ? "收起左侧参数" : "展开左侧参数"}
          onClick={() => setLeftOpen((open) => !open)}
        >
          {leftOpen ? "‹" : "›"}
        </button>
        <button
          type="button"
          className="sidebar-edge-toggle right"
          aria-label={rightOpen ? "收起右侧状态" : "展开右侧状态"}
          onClick={() => setRightOpen((open) => !open)}
        >
          {rightOpen ? "›" : "‹"}
        </button>
        <GlobeViewer />
        <div className="viewer-legend">
          <span><i className="legend-line dashed" />LVLH 轴</span>
          <span><i className="legend-line solid" />本体轴（X/Y/Z：红/绿/蓝）</span>
          <span><i className="legend-line beam" />天线 +Za</span>
          <span><i className="legend-swatch footprint" />瞬时覆盖区</span>
          <span><i className="legend-swatch history" />累计扫描带</span>
          <span><i className="legend-swatch preview" />未来覆盖预览</span>
        </div>
      </section>
      <aside className="sidebar right-sidebar" hidden={!rightOpen} aria-hidden={!rightOpen}>
        <StatusPanel />
      </aside>
    </div>
  );
}

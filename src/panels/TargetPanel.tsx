import {
  Button,
  Alert,
  Divider,
  Form,
  Input,
  InputNumber,
  Space,
  Select,
  Switch,
  Typography,
} from "antd";
import { useState } from "react";
import { useSimulationStore } from "../stores/simulationStore";
import { TARGET_TYPE_LABELS } from "../simulation/targetRegion";

const { Text, Title } = Typography;

export function TargetPanel() {
  const [polygonText, setPolygonText] = useState("");
  const [polygonError, setPolygonError] = useState<string>();
  const draft = useSimulationStore((state) => state.targetDraft);
  const targets = useSimulationStore((state) => state.targets);
  const pickedLocation = useSimulationStore((state) => state.pickedLocation);
  const settings = useSimulationStore((state) => state.missionSettings);
  const historyCount = useSimulationStore((state) => state.coverageHistory.length);
  const unionPolygonCount = useSimulationStore((state) => state.coverageUnion.length);
  const updateDraft = useSimulationStore((state) => state.updateTargetDraft);
  const addTarget = useSimulationStore((state) => state.addTargetFromDraft);
  const addPicked = useSimulationStore((state) => state.addTargetAtPickedLocation);
  const removeTarget = useSimulationStore((state) => state.removeTarget);
  const clearTargets = useSimulationStore((state) => state.clearTargets);
  const updateMissionSettings = useSimulationStore(
    (state) => state.updateMissionSettings,
  );
  const clearCoverageHistory = useSimulationStore(
    (state) => state.clearCoverageHistory,
  );
  const commitPolygonText = () => {
    try {
      const vertices = polygonText.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
        const values = line.split(/[\s,]+/).map(Number);
        if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) throw new Error(`第 ${index + 1} 个顶点格式应为“经度,纬度”。`);
        if (values[0] < -180 || values[0] > 180 || values[1] < -90 || values[1] > 90) throw new Error(`第 ${index + 1} 个顶点经纬度越界。`);
        return { longitudeDeg: values[0], latitudeDeg: values[1] };
      });
      if (vertices.length < 3) throw new Error("任意多边形至少需要 3 个顶点。" );
      updateDraft({
        vertices,
        longitudeDeg: Math.atan2(
          vertices.reduce((sum, vertex) => sum + Math.sin(vertex.longitudeDeg * Math.PI / 180), 0),
          vertices.reduce((sum, vertex) => sum + Math.cos(vertex.longitudeDeg * Math.PI / 180), 0),
        ) * 180 / Math.PI,
        latitudeDeg: vertices.reduce((sum, vertex) => sum + vertex.latitudeDeg, 0) / vertices.length,
      });
      setPolygonError(undefined);
    } catch (error) {
      setPolygonError(error instanceof Error ? error.message : "多边形顶点无效。" );
    }
  };

  return (
    <section className="panel-section target-panel">
      <Title level={4}>目标与累计覆盖</Title>
      <Form layout="vertical" size="small" className="parameter-form compact-form">
        <Form.Item label="目标名称">
          <Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
        </Form.Item>
        <Form.Item label="目标类型">
          <Select
            value={draft.targetType}
            options={Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(targetType) => updateDraft({ targetType })}
          />
        </Form.Item>
        <Form.Item label="经度 (deg)">
          <InputNumber min={-180} max={180} step={0.1} value={draft.longitudeDeg} onChange={(longitudeDeg) => longitudeDeg !== null && updateDraft({ longitudeDeg })} />
        </Form.Item>
        <Form.Item label="纬度 (deg)">
          <InputNumber min={-90} max={90} step={0.1} value={draft.latitudeDeg} onChange={(latitudeDeg) => latitudeDeg !== null && updateDraft({ latitudeDeg })} />
        </Form.Item>
        <Form.Item label="高度 (m)">
          <InputNumber min={-500} max={100_000} step={10} value={draft.altitudeM} onChange={(altitudeM) => altitudeM !== null && updateDraft({ altitudeM })} />
        </Form.Item>
        {draft.targetType === "circle" && (
          <Form.Item label="圆形半径 (km)">
            <InputNumber min={0.001} max={20_000} step={10} value={draft.radiusM / 1000} onChange={(radiusKm) => radiusKm !== null && updateDraft({ radiusM: radiusKm * 1000 })} />
          </Form.Item>
        )}
        {draft.targetType === "rectangle" && (
          <>
            <Form.Item label="矩形东西宽度 (km)">
              <InputNumber min={0.001} max={20_000} step={10} value={draft.widthM / 1000} onChange={(widthKm) => widthKm !== null && updateDraft({ widthM: widthKm * 1000 })} />
            </Form.Item>
            <Form.Item label="矩形南北高度 (km)">
              <InputNumber min={0.001} max={20_000} step={10} value={draft.heightM / 1000} onChange={(heightKm) => heightKm !== null && updateDraft({ heightM: heightKm * 1000 })} />
            </Form.Item>
          </>
        )}
        {draft.targetType === "polygon" && (
          <Form.Item label="多边形顶点（每行 经度,纬度）">
            <Input.TextArea rows={5} value={polygonText} placeholder={"67.0,-0.5\n68.0,-0.5\n68.2,0.5\n67.1,0.6"} onChange={(event) => setPolygonText(event.target.value)} onBlur={commitPolygonText} />
            {polygonError && <Alert type="error" showIcon title={polygonError} />}
            {!polygonError && draft.vertices.length >= 3 && <Text type="secondary">已解析 {draft.vertices.length} 个顶点。</Text>}
          </Form.Item>
        )}
        <Space orientation="vertical" className="full-width-space">
          <Button type="primary" block disabled={!draft.name.trim() || (draft.targetType === "polygon" && draft.vertices.length < 3)} onClick={addTarget}>
            添加输入{TARGET_TYPE_LABELS[draft.targetType]}
          </Button>
          <Button block disabled={!pickedLocation || !draft.name.trim() || draft.targetType === "polygon"} onClick={addPicked}>
            将地球拾取点添加为目标
          </Button>
        </Space>
      </Form>

      <div className="target-list-header">
        <Text strong>目标列表（{targets.length}）</Text>
        <Button type="link" size="small" disabled={targets.length === 0} onClick={clearTargets}>
          全部清除
        </Button>
      </div>
      <div className="target-list">
        {targets.length === 0 ? (
          <Text type="secondary">尚未添加目标</Text>
        ) : (
          targets.map((target) => (
            <div className="target-list-item" key={target.id}>
              <div>
                <Text>{target.name}</Text>
                <Text type="secondary">
                  {TARGET_TYPE_LABELS[target.targetType]} · {target.longitudeDeg.toFixed(3)}°, {target.latitudeDeg.toFixed(3)}°
                </Text>
              </div>
              <Button danger type="text" size="small" onClick={() => removeTarget(target.id)}>
                删除
              </Button>
            </div>
          ))
        )}
      </div>

      <Divider />
      <Form layout="vertical" size="small" className="compact-form">
        <Form.Item label="累计扫描带">
          <Switch
            checked={settings.historyEnabled}
            checkedChildren="开启"
            unCheckedChildren="关闭"
            onChange={(historyEnabled) => updateMissionSettings({ historyEnabled })}
          />
        </Form.Item>
        <Form.Item label="累计覆盖显示方式">
          <Select
            value={settings.historyDisplayMode}
            options={[
              { value: "footprints", label: "轨迹带（保留逐时覆盖区）" },
              { value: "union", label: "真实几何并集" },
            ]}
            onChange={(historyDisplayMode) => updateMissionSettings({ historyDisplayMode })}
          />
        </Form.Item>
        <Form.Item label="历史采样间隔 (s)">
          <InputNumber min={1} max={300} step={1} value={settings.historySampleIntervalSeconds} onChange={(historySampleIntervalSeconds) => historySampleIntervalSeconds !== null && updateMissionSettings({ historySampleIntervalSeconds })} />
        </Form.Item>
        <Form.Item label="最多保留覆盖区数量">
          <InputNumber min={10} max={600} step={10} value={settings.maxHistoryFootprints} onChange={(maxHistoryFootprints) => maxHistoryFootprints !== null && updateMissionSettings({ maxHistoryFootprints })} />
        </Form.Item>
        <Button block onClick={clearCoverageHistory} disabled={historyCount === 0}>
          清除累计覆盖（{historyCount} 帧{settings.historyDisplayMode === "union" ? ` / ${unionPolygonCount} 区域` : ""}）
        </Button>
      </Form>
    </section>
  );
}

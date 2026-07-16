import { Button, Input, InputNumber, Space, Switch, Typography } from "antd";
import { useSimulationStore, type DisplaySettings } from "../stores/simulationStore";

const { Title } = Typography;

type BooleanDisplayKey = {
  [K in keyof DisplaySettings]: DisplaySettings[K] extends boolean ? K : never
}[keyof DisplaySettings];

const layers: Array<{ key: BooleanDisplayKey; label: string }> = [
  { key: "showEarthTexture", label: "地球贴图" },
  { key: "showGrid", label: "地球经纬网" },
  { key: "showBorders", label: "国界" },
  { key: "showEarthReferences", label: "地心、地轴与赤道面" },
  { key: "lightingEnabled", label: "昼夜光照" },
  { key: "showOrbit", label: "三维轨道" },
  { key: "showGroundTrack", label: "地面航迹" },
  { key: "showAxes", label: "局部坐标轴" },
  { key: "showBeam", label: "波束体与射线" },
  { key: "showFootprint", label: "瞬时覆盖区" },
  { key: "showTargets", label: "地面目标" },
  { key: "showHistory", label: "累计扫描带" },
];

export function DisplayPanel() {
  const settings = useSimulationStore((state) => state.displaySettings);
  const update = useSimulationStore((state) => state.updateDisplaySettings);
  const loadLocalModel = (file: File | undefined) => {
    if (!file) return;
    if (!/\\.(gltf|glb)$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") update({ satelliteModelUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };
  return (
    <section className="panel-section display-panel">
      <Title level={4}>显示图层</Title>
      <Space orientation="vertical" size={6} className="full-width-space">
        {layers.map(({ key, label }) => (
          <label className="display-toggle" key={key}>
            <span>{label}</span>
            <Switch size="small" checked={settings[key] as boolean} onChange={(checked) => update({ [key]: checked })} />
          </label>
        ))}
        <label className="display-toggle">
          <span>卫星显示缩放 (×)</span>
          <InputNumber
            size="small"
            min={0.25}
            max={4}
            step={0.25}
            value={settings.satelliteScale}
            onChange={(value) => value !== null && update({ satelliteScale: value })}
          />
        </label>
        <div className="display-model-config">
          <span>glTF/GLB 卫星模型</span>
          <Input
            size="small"
            allowClear
            placeholder="模型 URL；留空使用简化模型"
            value={settings.satelliteModelUrl.startsWith("data:") ? "已加载本地模型" : settings.satelliteModelUrl}
            onChange={(event) => update({ satelliteModelUrl: event.target.value })}
          />
          <Space size={6} wrap>
            <Button size="small" onClick={() => document.getElementById("satellite-model-file")?.click()}>导入本地模型</Button>
            <Button size="small" disabled={!settings.satelliteModelUrl} onClick={() => update({ satelliteModelUrl: "" })}>使用简化模型</Button>
          </Space>
          <input
            id="satellite-model-file"
            hidden
            type="file"
            accept=".gltf,.glb,model/gltf+json,model/gltf-binary"
            onChange={(event) => {
              loadLocalModel(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </Space>
    </section>
  );
}

import { Alert, Button, Descriptions, Form, Input, InputNumber, Space, Switch, Typography } from "antd";
import { terrainHeightRangeM } from "@spacedrone/orbital-core";
import { useRef, useState } from "react";
import { parseTerrainFile } from "../io/terrainImport";
import { useSimulationStore } from "../stores/simulationStore";

const { Text, Title } = Typography;

export function TerrainPanel() {
  const terrain = useSimulationStore((state) => state.terrain);
  const updateTerrain = useSimulationStore((state) => state.updateTerrain);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const grid = terrain.grid;
  const range = grid ? terrainHeightRangeM(grid) : undefined;

  const importFile = async (file: File) => {
    try {
      const imported = parseTerrainFile(await file.text(), file.name);
      updateTerrain({ grid: { ...imported, name: imported.name === "导入 CSV DEM" ? file.name : imported.name }, enabled: true });
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DEM 导入失败。");
    }
  };

  return <section className="panel-section terrain-panel">
    <Title level={4}>数字高程与地形遮挡</Title>
    <Text type="secondary">导入规则经纬网 DEM；波束射线与高程面求交，目标视线按固定间隔检测山体遮挡。</Text>
    <input
      ref={inputRef}
      hidden
      type="file"
      accept=".csv,.json,application/json,text/csv"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void importFile(file);
        event.currentTarget.value = "";
      }}
    />
    <Space wrap>
      <Button onClick={() => inputRef.current?.click()}>导入 DEM</Button>
      <Button disabled={!grid} danger onClick={() => updateTerrain({ grid: null, enabled: false })}>清除</Button>
    </Space>
    {error && <Alert type="error" showIcon title="DEM 导入失败" description={error} />}
    {!grid && <Alert type="info" showIcon title="尚未导入 DEM" description="CSV 每行使用 longitudeDeg, latitudeDeg, heightM；JSON 使用同名规则网格数组。" />}
    {grid && <Descriptions size="small" column={1} colon={false}>
      <Descriptions.Item label="名称">{grid.name}</Descriptions.Item>
      <Descriptions.Item label="网格">{grid.longitudeDeg.length} × {grid.latitudeDeg.length}（{grid.longitudeDeg.length * grid.latitudeDeg.length} 点）</Descriptions.Item>
      <Descriptions.Item label="经度">{grid.longitudeDeg[0]}° ～ {grid.longitudeDeg.at(-1)}°</Descriptions.Item>
      <Descriptions.Item label="纬度">{grid.latitudeDeg[0]}° ～ {grid.latitudeDeg.at(-1)}°</Descriptions.Item>
      <Descriptions.Item label="高程">{range?.minimumM.toFixed(1)} m ～ {range?.maximumM.toFixed(1)} m</Descriptions.Item>
    </Descriptions>}
    <Form layout="vertical" size="small" className="parameter-form">
      <Form.Item label="启用 DEM"><Switch checked={terrain.enabled} disabled={!grid} onChange={(enabled) => updateTerrain({ enabled })} /></Form.Item>
      <Form.Item label="DEM 外回退到 WGS84"><Switch checked={terrain.fallbackToEllipsoid} onChange={(fallbackToEllipsoid) => updateTerrain({ fallbackToEllipsoid })} /></Form.Item>
      <Form.Item label="射线求交容差 (m)"><InputNumber min={0.001} max={100} value={terrain.rayToleranceM} onChange={(rayToleranceM) => rayToleranceM !== null && updateTerrain({ rayToleranceM })} /></Form.Item>
      <Form.Item label="启用目标地形视线"><Switch checked={terrain.lineOfSightEnabled} onChange={(lineOfSightEnabled) => updateTerrain({ lineOfSightEnabled })} /></Form.Item>
      <Form.Item label="视线采样间隔 (m)"><InputNumber min={1} max={1_000_000} value={terrain.lineOfSightSampleSpacingM} onChange={(lineOfSightSampleSpacingM) => lineOfSightSampleSpacingM !== null && updateTerrain({ lineOfSightSampleSpacingM })} /></Form.Item>
      <Form.Item label="地形净空 (m)"><InputNumber min={0} max={100_000} value={terrain.lineOfSightClearanceM} onChange={(lineOfSightClearanceM) => lineOfSightClearanceM !== null && updateTerrain({ lineOfSightClearanceM })} /></Form.Item>
      <Form.Item label="网格颜色"><Input type="color" value={terrain.color} onChange={(event) => updateTerrain({ color: event.target.value })} /></Form.Item>
      <Form.Item label="网格透明度"><InputNumber min={0.05} max={1} step={0.05} value={terrain.opacity} onChange={(opacity) => opacity !== null && updateTerrain({ opacity })} /></Form.Item>
    </Form>
    <Alert type="warning" showIcon title="当前限制" description="目标高程仍由目标参数给定，不自动贴附 DEM；地形法线暂不参与入射角计算。视线采样可能漏过窄于采样间隔的尖峰。" />
  </section>;
}

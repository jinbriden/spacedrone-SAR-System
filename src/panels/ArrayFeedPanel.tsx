import { Alert, Button, Collapse, Form, Input, InputNumber, Space, Switch, Typography } from "antd";
import { useSimulationStore, type AntennaFeedConfig } from "../stores/simulationStore";

const { Text, Title } = Typography;
const palette = ["#ff7875", "#95de64", "#b37feb", "#5cdbd3", "#ffd666", "#69c0ff"];

function createFeed(index: number): AntennaFeedConfig {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `feed-${Date.now()}-${Math.random()}`,
    name: `FEED-${index + 1}`,
    enabled: true,
    offsetXM: 0,
    offsetYM: 0,
    offsetZM: 0,
    steeringAzimuthOffsetDeg: index % 2 === 0 ? 6 * (Math.floor(index / 2) + 1) : -6 * (Math.floor(index / 2) + 1),
    steeringElevationOffsetDeg: 0,
    beamwidthScale: 1,
    relativePowerDb: 0,
    color: palette[index % palette.length],
  };
}

export function ArrayFeedPanel() {
  const antenna = useSimulationStore((state) => state.antenna);
  const updateAntenna = useSimulationStore((state) => state.updateAntenna);
  const feeds = antenna.arrayFeeds;
  const updateFeed = (id: string, patch: Partial<AntennaFeedConfig>) =>
    updateAntenna({ arrayFeeds: feeds.map((feed) => feed.id === id ? { ...feed, ...patch } : feed) });
  const removeFeed = (id: string) =>
    updateAntenna({ arrayFeeds: feeds.filter((feed) => feed.id !== id) });
  const addFeed = () => {
    if (feeds.length >= 31) return;
    updateAntenna({ arrayFeeds: [...feeds, createFeed(feeds.length)] });
  };
  const createThreeBeamRow = () => updateAntenna({
    arrayFeeds: [
      { ...createFeed(0), name: "FEED-L", steeringAzimuthOffsetDeg: -6, color: "#ff7875" },
      { ...createFeed(1), name: "FEED-R", steeringAzimuthOffsetDeg: 6, color: "#95de64" },
    ],
  });

  return <section className="panel-section array-feed-panel">
    <Title level={4}>多波束与阵列馈源</Title>
    <Text type="secondary">主天线波束始终作为中心馈源；每个附加馈源拥有独立相位中心、指向偏置、波束宽度倍率和相对功率。</Text>
    <Alert
      type="info"
      showIcon
      title={`当前 ${1 + feeds.filter((feed) => feed.enabled).length} 个启用波束`}
      description="附加馈源继承主天线的波束类型、方向图和时间扫描规律，再叠加自身指向偏置。最大扫描角对每个波束分别限幅。"
    />
    <Space wrap>
      <Button type="primary" size="small" disabled={feeds.length >= 31} onClick={addFeed}>添加馈源</Button>
      <Button size="small" onClick={createThreeBeamRow}>三波束横排</Button>
      <Button size="small" danger disabled={feeds.length === 0} onClick={() => updateAntenna({ arrayFeeds: [] })}>清除附加馈源</Button>
    </Space>
    {feeds.length === 0 ? <Text type="secondary">当前为单波束模式。</Text> : <Collapse
      size="small"
      items={feeds.map((feed) => ({
        key: feed.id,
        label: `${feed.name}${feed.enabled ? "" : "（已禁用）"} · ΔAz ${feed.steeringAzimuthOffsetDeg.toFixed(1)}° / ΔEl ${feed.steeringElevationOffsetDeg.toFixed(1)}°`,
        children: <Form layout="vertical" size="small" className="parameter-form compact-form">
          <Form.Item label="启用"><Switch checked={feed.enabled} onChange={(enabled) => updateFeed(feed.id, { enabled })} /></Form.Item>
          <Form.Item label="馈源名称"><Input value={feed.name} onChange={(event) => updateFeed(feed.id, { name: event.target.value })} /></Form.Item>
          <Form.Item label="相位中心 Xa (m)"><InputNumber min={-1000} max={1000} step={0.01} value={feed.offsetXM} onChange={(offsetXM) => offsetXM !== null && updateFeed(feed.id, { offsetXM })} /></Form.Item>
          <Form.Item label="相位中心 Ya (m)"><InputNumber min={-1000} max={1000} step={0.01} value={feed.offsetYM} onChange={(offsetYM) => offsetYM !== null && updateFeed(feed.id, { offsetYM })} /></Form.Item>
          <Form.Item label="相位中心 Za (m)"><InputNumber min={-1000} max={1000} step={0.01} value={feed.offsetZM} onChange={(offsetZM) => offsetZM !== null && updateFeed(feed.id, { offsetZM })} /></Form.Item>
          <Form.Item label="方位指向偏置 (deg)"><InputNumber min={-89} max={89} step={0.5} value={feed.steeringAzimuthOffsetDeg} onChange={(steeringAzimuthOffsetDeg) => steeringAzimuthOffsetDeg !== null && updateFeed(feed.id, { steeringAzimuthOffsetDeg })} /></Form.Item>
          <Form.Item label="俯仰指向偏置 (deg)"><InputNumber min={-89} max={89} step={0.5} value={feed.steeringElevationOffsetDeg} onChange={(steeringElevationOffsetDeg) => steeringElevationOffsetDeg !== null && updateFeed(feed.id, { steeringElevationOffsetDeg })} /></Form.Item>
          <Form.Item label="波束宽度倍率"><InputNumber min={0.01} max={100} step={0.1} value={feed.beamwidthScale} onChange={(beamwidthScale) => beamwidthScale !== null && updateFeed(feed.id, { beamwidthScale })} /></Form.Item>
          <Form.Item label="相对功率 (dB)"><InputNumber min={-100} max={100} step={0.5} value={feed.relativePowerDb} onChange={(relativePowerDb) => relativePowerDb !== null && updateFeed(feed.id, { relativePowerDb })} /></Form.Item>
          <Form.Item label="显示颜色"><Input type="color" value={feed.color} onChange={(event) => updateFeed(feed.id, { color: event.target.value })} /></Form.Item>
          <Button danger size="small" onClick={() => removeFeed(feed.id)}>删除馈源</Button>
        </Form>,
      }))}
    />}
    <Alert type="warning" showIcon title="几何级馈源模型" description="当前由馈源位置和显式指向偏置生成多波束，尚未根据反射面焦距或阵列复权自动求电磁方向图；相对功率作为工程元数据保留。" />
  </section>;
}

import { Card, Space, Tag, Typography } from "antd";
import { RAD_TO_DEG } from "@spacedrone/orbital-core";
import { useTargetStates } from "../hooks/useTargetStates";
import { useSimulationStore } from "../stores/simulationStore";
import { TARGET_TYPE_LABELS } from "../simulation/targetRegion";

const { Text, Title } = Typography;

function formatEventTime(epochUtc: string, seconds?: number): string {
  if (seconds === undefined) return "—";
  return new Date(new Date(epochUtc).getTime() + seconds * 1000).toISOString();
}

export function TargetStatusPanel() {
  const targetStates = useTargetStates();
  const passes = useSimulationStore((state) => state.targetPasses);
  const epochUtc = useSimulationStore((state) => state.orbit.epochUtc);

  return (
    <section className="target-status-section">
      <Title level={5}>地面目标状态</Title>
      {targetStates.length === 0 ? (
        <Text type="secondary">尚未添加目标</Text>
      ) : (
        <Space orientation="vertical" className="target-status-list">
          {targetStates.map(({ target, observation, terrainOccluded, selectedBeamName, illuminatingBeamIds }) => {
            const pass = passes[target.id];
            return (
              <Card key={target.id} size="small" title={target.name}>
                <Space wrap size={[4, 4]}>
                  <Tag>{TARGET_TYPE_LABELS[target.targetType]}</Tag>
                  <Tag color={observation.visibleAboveHorizon ? "blue" : "default"}>
                    {observation.visibleAboveHorizon ? "地平线上" : "不可见"}
                  </Tag>
                  <Tag color={observation.insideFootprint ? "success" : "default"}>
                    {observation.insideFootprint ? (target.targetType === "point" ? "波束命中" : "区域相交") : "未命中"}
                  </Tag>
                  {terrainOccluded && <Tag color="error">地形遮挡</Tag>}
                  {illuminatingBeamIds.length > 0 && <Tag color="purple">{illuminatingBeamIds.length} 波束命中</Tag>}
                </Space>
                <div className="target-metrics">
                  <Text>斜距：{(observation.slantRangeM / 1000).toFixed(2)} km</Text>
                  <Text>最近波束：{selectedBeamName}</Text>
                  <Text>入射角：{(observation.incidenceAngleRad * RAD_TO_DEG).toFixed(2)}°</Text>
                  <Text>
                    方位/俯仰偏差：{(observation.azimuthDeviationRad * RAD_TO_DEG).toFixed(2)}° / {(observation.elevationDeviationRad * RAD_TO_DEG).toFixed(2)}°
                  </Text>
                  <Text>首次进入：{formatEventTime(epochUtc, pass?.firstEntrySeconds)}</Text>
                  <Text>最近离开：{formatEventTime(epochUtc, pass?.lastExitSeconds)}</Text>
                  <Text>累计照射：{(pass?.cumulativeIlluminationSeconds ?? 0).toFixed(1)} s</Text>
                </div>
              </Card>
            );
          })}
        </Space>
      )}
    </section>
  );
}

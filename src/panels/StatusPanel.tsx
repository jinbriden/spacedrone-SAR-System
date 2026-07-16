import { Alert, Descriptions, Space, Tag, Typography } from "antd";
import { J2SecularOrbitPropagator, RAD_TO_DEG, TleSgp4OrbitPropagator } from "@spacedrone/orbital-core";
import { useSatelliteState } from "../hooks/useSatelliteState";
import { useAttitudeState } from "../hooks/useAttitudeState";
import { useCoverageState } from "../hooks/useCoverageState";
import { useSimulationStore } from "../stores/simulationStore";
import { TargetStatusPanel } from "./TargetStatusPanel";

const { Text, Title } = Typography;

function formatVector(vector: readonly number[], divisor = 1, digits = 2): string {
  return vector.map((value) => (value / divisor).toFixed(digits)).join(", ");
}

const TASK_MODE_LABELS = {
  generic: "通用扫描规律",
  stripmap: "Stripmap 固定条带",
  spotlight: "Spotlight 目标跟踪",
  scanSar: "ScanSAR 子测绘带",
  tops: "TOPS 方位扫掠",
} as const;

export function StatusPanel() {
  const satellite = useSatelliteState();
  const attitudeState = useAttitudeState();
  const coverage = useCoverageState();
  const orbit = useSimulationStore((state) => state.orbit);
  const attitudeConfig = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const pickedLocation = useSimulationStore((state) => state.pickedLocation);
  const companionSatellites = useSimulationStore((state) => state.companionSatellites);

  return (
    <section className="panel-section status-panel">
      <Title level={4}>实时状态</Title>
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="UTC">
          {satellite.dateUtc.toISOString()}
        </Descriptions.Item>
        <Descriptions.Item label="星座规模">
          {1 + companionSatellites.filter((item) => item.enabled).length} 颗启用 / {1 + companionSatellites.length} 颗配置
        </Descriptions.Item>
        <Descriptions.Item label="经纬高">
          {satellite.longitudeDeg.toFixed(4)}°, {satellite.latitudeDeg.toFixed(4)}°,
          {(satellite.altitudeM / 1000).toFixed(2)} km
        </Descriptions.Item>
        <Descriptions.Item label="ECI 位置 (km)">
          {formatVector(satellite.positionEciM, 1000)}
        </Descriptions.Item>
        <Descriptions.Item label="ECI 速度 (km/s)">
          {formatVector(satellite.velocityEciMps, 1000, 4)}
        </Descriptions.Item>
        <Descriptions.Item label="ECEF 位置 (km)">
          {formatVector(satellite.positionEcefM, 1000)}
        </Descriptions.Item>
        <Descriptions.Item label="瞬时速度">
          {(satellite.speedMps / 1000).toFixed(4)} km/s
        </Descriptions.Item>
        <Descriptions.Item label="轨道周期">
          {(satellite.propagator.periodSeconds / 60).toFixed(2)} min
        </Descriptions.Item>
        <Descriptions.Item label="传播模型">
          {orbit.propagationModel === "sgp4" ? "SGP4 / SDP4（TLE）" : orbit.propagationModel === "j2Secular" ? "J2 平均根数" : "二体开普勒"}
        </Descriptions.Item>
        {satellite.propagator instanceof TleSgp4OrbitPropagator && <>
          <Descriptions.Item label="TLE 卫星 / 分支">
            NORAD {satellite.propagator.metadata.satelliteNumber} / {satellite.propagator.metadata.method === "near-earth" ? "SGP4 近地" : "SDP4 深空"}
          </Descriptions.Item>
          <Descriptions.Item label="TLE 历元">
            {satellite.propagator.metadata.tleEpochUtc}
          </Descriptions.Item>
        </>}
        {satellite.propagator instanceof J2SecularOrbitPropagator && (
          <Descriptions.Item label="J2 RAAN 漂移">
            {(satellite.propagator.rates.raanRateRadS * RAD_TO_DEG * 86_400).toFixed(4)} deg/day
          </Descriptions.Item>
        )}
        <Descriptions.Item label="本体姿态 R/P/Y">
          {(attitudeState.effectiveEulerRad.rollRad * RAD_TO_DEG).toFixed(1)}°, {" "}
          {(attitudeState.effectiveEulerRad.pitchRad * RAD_TO_DEG).toFixed(1)}°, {" "}
          {(attitudeState.effectiveEulerRad.yawRad * RAD_TO_DEG).toFixed(1)}°
        </Descriptions.Item>
        <Descriptions.Item label="姿态限制">
          R/P/Y ≤ {attitudeConfig.maxRollDeg.toFixed(1)}° / {attitudeConfig.maxPitchDeg.toFixed(1)}° / {attitudeConfig.maxYawDeg.toFixed(1)}°；
          ω ≤ {attitudeConfig.maxAngularRateDegS.toFixed(2)} deg/s；α ≤ {attitudeConfig.maxAngularAccelerationDegS2.toFixed(2)} deg/s²
        </Descriptions.Item>
        <Descriptions.Item label="天线安装 R/P/Y">
          {antenna.mountRollDeg.toFixed(1)}°, {antenna.mountPitchDeg.toFixed(1)}°, {antenna.mountYawDeg.toFixed(1)}°
        </Descriptions.Item>
        <Descriptions.Item label="任务扫描模式">
          {TASK_MODE_LABELS[antenna.taskMode]}
        </Descriptions.Item>
        <Descriptions.Item label="启用波束 / 配置馈源">
          {1 + antenna.arrayFeeds.filter((feed) => feed.enabled).length} / {1 + antenna.arrayFeeds.length}
        </Descriptions.Item>
        <Descriptions.Item label="波束轴 ECEF">
          {formatVector(attitudeState.beamAxisEcef, 1, 5)}
        </Descriptions.Item>
        <Descriptions.Item label="有效扫描方位/俯仰">
          {(coverage.effectiveSteering.azimuthRad * RAD_TO_DEG).toFixed(2)}° / {" "}
          {(coverage.effectiveSteering.elevationRad * RAD_TO_DEG).toFixed(2)}°
        </Descriptions.Item>
        <Descriptions.Item label="波束离轴角">
          {(Math.hypot(
            coverage.effectiveSteering.azimuthRad,
            coverage.effectiveSteering.elevationRad,
          ) * RAD_TO_DEG).toFixed(2)}°
        </Descriptions.Item>
        {antenna.beamType === "pattern" && (
          <Descriptions.Item label="方向图峰值 / 门限">
            {coverage.patternPeakGainDb !== undefined && coverage.patternThresholdGainDb !== undefined
              ? `${coverage.patternPeakGainDb.toFixed(2)} / ${coverage.patternThresholdGainDb.toFixed(2)} dB`
              : "—"}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="波束中心地面点">
          {coverage.centerGeodetic
            ? `${(coverage.centerGeodetic.longitudeRad * RAD_TO_DEG).toFixed(4)}°, ${(coverage.centerGeodetic.latitudeRad * RAD_TO_DEG).toFixed(4)}°`
            : "无地面交点"}
        </Descriptions.Item>
        <Descriptions.Item label="DEM 射线命中 / 回退">
          {coverage.terrainIntersectionCount} / {coverage.terrainFallbackCount}
        </Descriptions.Item>
        <Descriptions.Item label="中心斜距">
          {coverage.centerIntersection
            ? `${(coverage.centerIntersection.distanceM / 1000).toFixed(2)} km`
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="地面入射角">
          {coverage.incidenceAngleRad !== undefined
            ? `${(coverage.incidenceAngleRad * RAD_TO_DEG).toFixed(2)}°`
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="沿轨 × 横轨">
          {coverage.alongTrackLengthM !== undefined && coverage.crossTrackWidthM !== undefined
            ? `${(coverage.alongTrackLengthM / 1000).toFixed(2)} × ${(coverage.crossTrackWidthM / 1000).toFixed(2)} km`
            : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="覆盖面积（局部投影）">
          {coverage.localProjectedAreaM2 !== undefined
            ? `${(coverage.localProjectedAreaM2 / 1e6).toFixed(2)} km²`
            : "—"}
        </Descriptions.Item>
      </Descriptions>
      <Space wrap size={[4, 4]} className="coverage-tags">
        <Tag color={coverage.isClosed ? "success" : "warning"}>
          {coverage.isClosed
            ? `闭合覆盖区 · ${coverage.vertices.length} 点`
            : `边界命中 ${coverage.validBoundaryRayCount}/${coverage.boundaryRayCount}`}
        </Tag>
        {coverage.crossesAntimeridian && <Tag color="orange">跨日界线</Tag>}
        {coverage.includesPolarRegion && <Tag color="purple">极区</Tag>}
      </Space>
      {coverage.warning && (
        <Alert
          className="coverage-warning"
          type="warning"
          showIcon
          title="无法生成闭合覆盖区"
          description={coverage.warning}
        />
      )}
      {coverage.taskModeWarning && (
        <Alert
          className="coverage-warning"
          type="warning"
          showIcon
          title="任务扫描模式已安全回退"
          description={coverage.taskModeWarning}
        />
      )}
      {coverage.beamPatternWarning && (
        <Alert
          className="coverage-warning"
          type="warning"
          showIcon
          title="二维方向图提示"
          description={coverage.beamPatternWarning}
        />
      )}
      {coverage.terrainWarning && (
        <Alert
          type="warning"
          showIcon
          title="DEM 覆盖范围不足"
          description={coverage.terrainWarning}
        />
      )}
      <div className="picked-location">
        <Text strong>地球拾取位置</Text>
        {pickedLocation ? (
          <Text>
            {pickedLocation.longitudeDeg.toFixed(5)}°, {pickedLocation.latitudeDeg.toFixed(5)}°,
            {pickedLocation.altitudeM.toFixed(1)} m
          </Text>
        ) : (
          <Text type="secondary">单击地球查看经纬高</Text>
        )}
      </div>
      <TargetStatusPanel />
    </section>
  );
}

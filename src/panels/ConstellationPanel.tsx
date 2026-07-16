import { Alert, Button, Collapse, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { parseTleMetadata } from "@spacedrone/orbital-core";
import { useSimulationStore, type CircularOrbitConfig } from "../stores/simulationStore";

const { Text, Title } = Typography;

export function ConstellationPanel() {
  const primaryOrbit = useSimulationStore((state) => state.orbit);
  const primaryAttitude = useSimulationStore((state) => state.attitude);
  const primaryAntenna = useSimulationStore((state) => state.antenna);
  const companions = useSimulationStore((state) => state.companionSatellites);
  const addCompanion = useSimulationStore((state) => state.addCompanionSatellite);
  const updateCompanion = useSimulationStore((state) => state.updateCompanionSatellite);
  const removeCompanion = useSimulationStore((state) => state.removeCompanionSatellite);
  const updateOrbit = (id: string, orbit: CircularOrbitConfig, patch: Partial<CircularOrbitConfig>) =>
    updateCompanion(id, { orbit: { ...orbit, ...patch } });
  const distributePhases = () => {
    const count = companions.filter((satellite) => satellite.orbit.mode !== "tle").length + 1;
    let index = 1;
    for (const satellite of companions) {
      if (satellite.orbit.mode === "tle") continue;
      const angle = primaryOrbit.initialPhaseDeg + 360 * index / count;
      updateOrbit(satellite.id, satellite.orbit, satellite.orbit.mode === "circular" ? { initialPhaseDeg: angle } : { initialAnomalyDeg: angle });
      index += 1;
    }
  };

  return <section className="panel-section constellation-panel">
    <Title level={4}>多星编队</Title>
    <Text type="secondary">SAT-1 为主星；伴飞星保存独立轨道、姿态和天线配置，并共享主星仿真 UTC。</Text>
    <Space wrap>
      <Button size="small" type="primary" disabled={companions.length >= 31} onClick={addCompanion}>从主星添加伴飞星</Button>
      <Button size="small" disabled={companions.length === 0} onClick={distributePhases}>均匀分配轨道相位</Button>
    </Space>
    {companions.length === 0 ? <Alert type="info" showIcon title="当前仅有主星 SAT-1" /> : <Collapse
      size="small"
      items={companions.map((satellite) => {
        let tleError: string | undefined;
        if (satellite.orbit.mode === "tle") {
          try { parseTleMetadata(satellite.orbit.tleLine1, satellite.orbit.tleLine2); }
          catch (error) { tleError = error instanceof Error ? error.message : "TLE 无效。"; }
        }
        return {
          key: satellite.id,
          label: `${satellite.name}${satellite.enabled ? "" : "（已禁用）"}`,
          children: <Form layout="vertical" size="small" className="parameter-form">
            <Form.Item label="参与仿真"><Switch checked={satellite.enabled} onChange={(enabled) => updateCompanion(satellite.id, { enabled })} /></Form.Item>
            <Form.Item label="卫星名称"><Input value={satellite.name} onChange={(event) => updateCompanion(satellite.id, { name: event.target.value })} /></Form.Item>
            <Form.Item label="显示颜色"><Input type="color" value={satellite.color} onChange={(event) => updateCompanion(satellite.id, { color: event.target.value })} /></Form.Item>
            <Form.Item label="轨道输入方式"><Input value={satellite.orbit.mode === "circular" ? "简化圆轨道" : satellite.orbit.mode === "keplerian" ? "开普勒六根数" : "TLE / SGP4"} disabled /></Form.Item>
            {satellite.orbit.mode !== "tle" && <Form.Item label="传播模型"><Select value={satellite.orbit.propagationModel} options={[{ value: "twoBody", label: "二体开普勒" }, { value: "j2Secular", label: "J2 平均根数" }]} onChange={(propagationModel) => updateOrbit(satellite.id, satellite.orbit, { propagationModel })} /></Form.Item>}
            {satellite.orbit.mode === "circular" ? <>
              <Form.Item label="轨道高度 (km)"><InputNumber min={100} max={100_000} value={satellite.orbit.altitudeM / 1000} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { altitudeM: value * 1000 })} /></Form.Item>
              <Form.Item label="轨道倾角 (deg)"><InputNumber min={0} max={180} value={satellite.orbit.inclinationDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { inclinationDeg: value })} /></Form.Item>
              <Form.Item label="RAAN (deg)"><InputNumber min={-360} max={360} value={satellite.orbit.raanDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { raanDeg: value })} /></Form.Item>
              <Form.Item label="初始轨道相位 (deg)"><InputNumber min={-720} max={720} value={satellite.orbit.initialPhaseDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { initialPhaseDeg: value })} /></Form.Item>
              <Form.Item label="运行方向"><Select value={satellite.orbit.direction} options={[{ value: 1, label: "顺行" }, { value: -1, label: "逆行" }]} onChange={(direction) => updateOrbit(satellite.id, satellite.orbit, { direction })} /></Form.Item>
            </> : satellite.orbit.mode === "keplerian" ? <>
              <Form.Item label="半长轴 (km)"><InputNumber min={6379} max={1_000_000} value={satellite.orbit.semiMajorAxisM / 1000} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { semiMajorAxisM: value * 1000 })} /></Form.Item>
              <Form.Item label="偏心率"><InputNumber min={0} max={0.99} precision={6} step={0.001} value={satellite.orbit.eccentricity} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { eccentricity: value })} /></Form.Item>
              <Form.Item label="轨道倾角 (deg)"><InputNumber min={0} max={180} value={satellite.orbit.inclinationDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { inclinationDeg: value })} /></Form.Item>
              <Form.Item label="RAAN (deg)"><InputNumber min={-360} max={360} value={satellite.orbit.raanDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { raanDeg: value })} /></Form.Item>
              <Form.Item label="近地点幅角 (deg)"><InputNumber min={-360} max={360} value={satellite.orbit.argumentOfPeriapsisDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { argumentOfPeriapsisDeg: value })} /></Form.Item>
              <Form.Item label={`初始${satellite.orbit.anomalyType === "mean" ? "平" : "真"}近点角 (deg)`}><InputNumber min={-720} max={720} value={satellite.orbit.initialAnomalyDeg} onChange={(value) => value !== null && updateOrbit(satellite.id, satellite.orbit, { initialAnomalyDeg: value })} /></Form.Item>
            </> : <>
              <Form.Item label="TLE 名称"><Input value={satellite.orbit.tleName} onChange={(event) => updateOrbit(satellite.id, satellite.orbit, { tleName: event.target.value })} /></Form.Item>
              <Form.Item label="TLE 第一行"><Input.TextArea value={satellite.orbit.tleLine1} status={tleError ? "error" : undefined} onChange={(event) => updateOrbit(satellite.id, satellite.orbit, { tleLine1: event.target.value })} /></Form.Item>
              <Form.Item label="TLE 第二行"><Input.TextArea value={satellite.orbit.tleLine2} status={tleError ? "error" : undefined} onChange={(event) => updateOrbit(satellite.id, satellite.orbit, { tleLine2: event.target.value })} /></Form.Item>
              {tleError && <Alert type="error" showIcon title="TLE 校验失败" description={tleError} />}
            </>}
            <Form.Item label="轨道历元 (UTC)"><Input value={satellite.orbit.epochUtc} onChange={(event) => updateOrbit(satellite.id, satellite.orbit, { epochUtc: event.target.value })} /></Form.Item>
            <Space wrap>
              <Button size="small" onClick={() => updateCompanion(satellite.id, { attitude: primaryAttitude, antenna: primaryAntenna })}>同步主星姿态与天线</Button>
              <Button size="small" danger onClick={() => removeCompanion(satellite.id)}>删除伴飞星</Button>
            </Space>
          </Form>,
        };
      })}
    />}
  </section>;
}

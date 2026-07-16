import { Alert, Button, Form, Input, InputNumber, Select, Switch, Typography } from "antd";
import { parseTleMetadata, WGS84_SEMI_MAJOR_AXIS_M } from "@spacedrone/orbital-core";
import { useRef } from "react";
import { useSimulationStore } from "../stores/simulationStore";

const { Text, Title } = Typography;

export function OrbitPanel() {
  const tleFileInputRef = useRef<HTMLInputElement>(null);
  const draft = useSimulationStore((state) => state.orbitDraft);
  const updateDraft = useSimulationStore((state) => state.updateOrbitDraft);
  const applyOrbit = useSimulationStore((state) => state.applyOrbit);
  const invalidEpoch = Number.isNaN(Date.parse(draft.epochUtc));
  const periapsisAltitudeM = draft.semiMajorAxisM * (1 - draft.eccentricity) - WGS84_SEMI_MAJOR_AXIS_M;
  const invalidKeplerian = draft.mode === "keplerian" && periapsisAltitudeM <= 0;
  let tleMetadata: ReturnType<typeof parseTleMetadata> | undefined;
  let tleError: string | undefined;
  if (draft.mode === "tle") {
    try { tleMetadata = parseTleMetadata(draft.tleLine1, draft.tleLine2); }
    catch (error) { tleError = error instanceof Error ? error.message : "TLE 无效。"; }
  }

  return (
    <section className="panel-section">
      <Title level={4}>轨道参数</Title>
      <Text type="secondary">
        位置和速度由所选轨道动力学推导，不作为独立输入。
      </Text>
      <Form layout="vertical" size="small" className="parameter-form">
        <Form.Item label="轨道输入方式">
          <Select
            value={draft.mode}
            options={[
              { value: "circular", label: "简化圆轨道" },
              { value: "keplerian", label: "开普勒六根数" },
              { value: "tle", label: "TLE / SGP4" },
            ]}
            onChange={(mode) => {
              if (mode === "tle") {
                try {
                  const metadata = parseTleMetadata(draft.tleLine1, draft.tleLine2);
                  updateDraft({ mode, propagationModel: "sgp4", epochUtc: metadata.tleEpochUtc });
                } catch {
                  updateDraft({ mode, propagationModel: "sgp4" });
                }
              } else {
                updateDraft({ mode, propagationModel: draft.propagationModel === "sgp4" ? "twoBody" : draft.propagationModel });
              }
            }}
          />
        </Form.Item>
        {draft.mode !== "tle" && (
        <Form.Item label="传播模型">
          <Select
            value={draft.propagationModel}
            options={[
              { value: "twoBody", label: "二体开普勒" },
              { value: "j2Secular", label: "J2 平均根数（长期漂移）" },
            ]}
            onChange={(propagationModel) => updateDraft({ propagationModel })}
          />
        </Form.Item>
        )}
        {draft.mode !== "tle" && draft.propagationModel === "j2Secular" && (
          <Alert
            type="info"
            showIcon
            title="一阶 J2 平均根数模型"
            description="包含 RAAN、近地点幅角和平均近点角的世俗漂移；不包含短周期项、阻力或高阶重力场。"
          />
        )}
        <Form.Item label="地球自转（影响 ECEF 与地面航迹）">
          <Switch checked={draft.earthRotationEnabled} onChange={(earthRotationEnabled) => updateDraft({ earthRotationEnabled })} />
        </Form.Item>
        {draft.mode === "tle" ? <>
          <Form.Item label="TLE 名称">
            <Input value={draft.tleName} onChange={(event) => updateDraft({ tleName: event.target.value })} />
          </Form.Item>
          <input
            ref={tleFileInputRef}
            hidden
            type="file"
            accept=".tle,.txt,text/plain"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const lines = (await file.text()).split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
              const firstLineIndex = lines.findIndex((line) => line.startsWith("1 "));
              const line1 = firstLineIndex >= 0 ? lines[firstLineIndex] : lines[0] ?? "";
              const line2 = firstLineIndex >= 0 ? lines[firstLineIndex + 1] ?? "" : lines[1] ?? "";
              const tleName = firstLineIndex > 0 ? lines.slice(0, firstLineIndex).join(" ") : file.name.replace(/\.(tle|txt)$/i, "");
              try {
                const metadata = parseTleMetadata(line1, line2);
                updateDraft({ tleName, tleLine1: line1, tleLine2: line2, epochUtc: metadata.tleEpochUtc });
              } catch {
                updateDraft({ tleName, tleLine1: line1, tleLine2: line2 });
              }
              event.target.value = "";
            }}
          />
          <Button size="small" onClick={() => tleFileInputRef.current?.click()}>导入 .tle / .txt 文件</Button>
          <Form.Item label="TLE 第一行">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 3 }} value={draft.tleLine1} status={tleError ? "error" : undefined} onChange={(event) => updateDraft({ tleLine1: event.target.value })} />
          </Form.Item>
          <Form.Item label="TLE 第二行">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 3 }} value={draft.tleLine2} status={tleError ? "error" : undefined} onChange={(event) => updateDraft({ tleLine2: event.target.value })} />
          </Form.Item>
          {tleMetadata ? (
            <Alert type="success" showIcon title={`NORAD ${tleMetadata.satelliteNumber} · ${tleMetadata.method === "near-earth" ? "SGP4 近地" : "SDP4 深空"}`} description={`TLE 历元 ${tleMetadata.tleEpochUtc}；周期 ${(tleMetadata.periodSeconds / 60).toFixed(3)} min。仿真历元可独立设置。`} />
          ) : (
            <Alert type="error" showIcon title="TLE 校验失败" description={tleError} />
          )}
          {tleMetadata && <Button size="small" onClick={() => updateDraft({ epochUtc: tleMetadata!.tleEpochUtc })}>仿真历元设为 TLE 历元</Button>}
        </> : draft.mode === "circular" ? <>
          <Form.Item label="轨道高度 (km)">
          <InputNumber
            min={100}
            max={100_000}
            step={10}
            value={draft.altitudeM / 1000}
            onChange={(value) =>
              value !== null && updateDraft({ altitudeM: value * 1000 })
            }
          />
          </Form.Item>
          <Form.Item label="初始轨道相位 (deg)">
            <InputNumber min={-360} max={360} step={1} value={draft.initialPhaseDeg} onChange={(value) => value !== null && updateDraft({ initialPhaseDeg: value })} />
          </Form.Item>
          <Form.Item label="运行方向">
            <Select value={draft.direction} options={[{ value: 1, label: "顺行" }, { value: -1, label: "逆行" }]} onChange={(direction) => updateDraft({ direction })} />
          </Form.Item>
        </> : <>
          <Form.Item label="半长轴 a (km)">
            <InputNumber min={6379} max={1_000_000} step={10} value={draft.semiMajorAxisM / 1000} onChange={(value) => value !== null && updateDraft({ semiMajorAxisM: value * 1000 })} />
          </Form.Item>
          <Form.Item label="偏心率 e">
            <InputNumber min={0} max={0.99} step={0.001} precision={6} value={draft.eccentricity} onChange={(value) => value !== null && updateDraft({ eccentricity: value })} />
          </Form.Item>
          <Form.Item label="近地点幅角 ω (deg)">
            <InputNumber min={-360} max={360} step={1} value={draft.argumentOfPeriapsisDeg} onChange={(value) => value !== null && updateDraft({ argumentOfPeriapsisDeg: value })} />
          </Form.Item>
          <Form.Item label="初始近点角类型">
            <Select value={draft.anomalyType} options={[{ value: "mean", label: "平近点角 M" }, { value: "true", label: "真近点角 ν" }]} onChange={(anomalyType) => updateDraft({ anomalyType })} />
          </Form.Item>
          <Form.Item label={`初始${draft.anomalyType === "mean" ? "平" : "真"}近点角 (deg)`}>
            <InputNumber min={-360} max={360} step={1} value={draft.initialAnomalyDeg} onChange={(value) => value !== null && updateDraft({ initialAnomalyDeg: value })} />
          </Form.Item>
          <Alert type={invalidKeplerian ? "error" : "info"} showIcon title={`近地点高度：${(periapsisAltitudeM / 1000).toFixed(2)} km`} description={invalidKeplerian ? "近地点位于 WGS84 地球内部，请增大半长轴或减小偏心率。" : undefined} />
        </>}
        {draft.mode !== "tle" && <><Form.Item label="轨道倾角 (deg)">
          <InputNumber
            min={0}
            max={180}
            step={0.1}
            value={draft.inclinationDeg}
            onChange={(value) =>
              value !== null && updateDraft({ inclinationDeg: value })
            }
          />
        </Form.Item>
        <Form.Item label="升交点赤经 RAAN (deg)">
          <InputNumber
            min={-360}
            max={360}
            step={1}
            value={draft.raanDeg}
            onChange={(value) => value !== null && updateDraft({ raanDeg: value })}
          />
        </Form.Item>
        </>}
        <Form.Item label="仿真历元 (UTC ISO 8601)">
          <Input
            value={draft.epochUtc}
            status={invalidEpoch ? "error" : undefined}
            onChange={(event) => updateDraft({ epochUtc: event.target.value })}
          />
        </Form.Item>
        <Button
          type="primary"
          block
          disabled={invalidEpoch || invalidKeplerian || Boolean(tleError)}
          onClick={applyOrbit}
        >
          应用并重新初始化
        </Button>
      </Form>
    </section>
  );
}

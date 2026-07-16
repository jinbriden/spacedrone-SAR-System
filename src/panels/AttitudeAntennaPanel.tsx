import { Alert, Button, Collapse, Form, Input, InputNumber, Select, Space, Typography } from "antd";
import { useRef, useState } from "react";
import { parseSteeringTableCsv } from "../io/steeringTableImport";
import { parseAttitudeSequenceCsv } from "../io/attitudeSequenceImport";
import { parseAntennaPatternFile } from "../io/antennaPatternImport";
import { useSimulationStore } from "../stores/simulationStore";
import { validateAttitudeConfigLimits } from "../simulation/attitudeLimits";

const { Text, Title } = Typography;

interface AngleInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  maxAbsDeg?: number;
}

function AngleInput({ label, value, onChange, maxAbsDeg = 180 }: AngleInputProps) {
  return (
    <Form.Item label={`${label} (deg)`}>
      <InputNumber
        min={-maxAbsDeg}
        max={maxAbsDeg}
        step={1}
        value={value}
        onChange={(next) => next !== null && onChange(next)}
      />
    </Form.Item>
  );
}

export function AttitudeAntennaPanel() {
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const targets = useSimulationStore((state) => state.targets);
  const updateAttitude = useSimulationStore((state) => state.updateAttitude);
  const updateAntenna = useSimulationStore((state) => state.updateAntenna);
  const steeringInputRef = useRef<HTMLInputElement>(null);
  const attitudeInputRef = useRef<HTMLInputElement>(null);
  const patternInputRef = useRef<HTMLInputElement>(null);
  const [steeringImportMessage, setSteeringImportMessage] = useState<{ type: "success" | "error"; text: string }>();
  const [attitudeImportMessage, setAttitudeImportMessage] = useState<{ type: "success" | "error"; text: string }>();
  const [patternImportMessage, setPatternImportMessage] = useState<{ type: "success" | "error"; text: string }>();
  const [attitudeLimitMessage, setAttitudeLimitMessage] = useState<string>();

  const updateValidatedAttitude = (patch: Partial<typeof attitude>) => {
    try {
      const candidate = { ...attitude, ...patch };
      validateAttitudeConfigLimits(candidate);
      updateAttitude(patch);
      setAttitudeLimitMessage(undefined);
      return true;
    } catch (error) {
      setAttitudeLimitMessage(error instanceof Error ? error.message : "姿态参数超过限制。" );
      return false;
    }
  };

  const importSteeringTable = async (file: File) => {
    try {
      const steeringTable = parseSteeringTableCsv(await file.text());
      updateAntenna({ steeringTable, scanMode: "custom" });
      setSteeringImportMessage({
        type: "success",
        text: `已导入 ${steeringTable.length} 点，时间范围 ${steeringTable[0].timeSeconds}～${steeringTable.at(-1)!.timeSeconds} s。`,
      });
    } catch (error) {
      setSteeringImportMessage({ type: "error", text: error instanceof Error ? error.message : "扫描时间表导入失败。" });
    }
  };

  const importAttitudeSequence = async (file: File) => {
    try {
      const sequence = parseAttitudeSequenceCsv(await file.text());
      const candidate = { ...attitude, sequence, mode: "external" as const };
      const diagnostics = validateAttitudeConfigLimits(candidate);
      updateAttitude({ sequence, mode: "external" });
      setAttitudeImportMessage({
        type: "success",
        text: `已导入 ${sequence.length} 点；最大角速度 ${diagnostics.maxObservedAngularRateDegS.toFixed(3)} deg/s，最大角加速度 ${diagnostics.maxObservedAngularAccelerationDegS2.toFixed(3)} deg/s²。`,
      });
    } catch (error) {
      setAttitudeImportMessage({ type: "error", text: error instanceof Error ? error.message : "姿态序列导入失败。" });
    }
  };

  const importGainPattern = async (file: File) => {
    try {
      const gainPattern = parseAntennaPatternFile(await file.text(), file.name);
      updateAntenna({ gainPattern, beamType: "pattern" });
      setPatternImportMessage({
        type: "success",
        text: `已导入“${gainPattern.name}”：${gainPattern.azimuthAnglesDeg.length} × ${gainPattern.elevationAnglesDeg.length} 网格。`,
      });
    } catch (error) {
      setPatternImportMessage({ type: "error", text: error instanceof Error ? error.message : "二维方向图导入失败。" });
    }
  };

  return (
    <section className="panel-section attitude-panel">
      <Title level={4}>姿态与天线</Title>
      <Text type="secondary">角度实时更新，旋转顺序固定为 Rz(yaw)Ry(pitch)Rx(roll)。</Text>
      <Collapse
        ghost
        defaultActiveKey={["attitude", "antenna"]}
        items={[
          {
            key: "attitude",
            label: "本体相对 LVLH",
            children: (
              <Form layout="vertical" size="small" className="parameter-form compact-form">
                <Form.Item label="姿态来源">
                  <Select
                    value={attitude.mode}
                    options={[
                      { value: "fixed", label: "固定 RPY 偏置" },
                      { value: "external", label: "外部姿态时间序列", disabled: attitude.sequence.length < 2 },
                    ]}
                    onChange={(mode) => updateAttitude({ mode })}
                  />
                </Form.Item>
                {attitude.mode === "fixed" && (
                  <>
                    <AngleInput label="Roll" value={attitude.rollDeg} maxAbsDeg={attitude.maxRollDeg} onChange={(rollDeg) => updateValidatedAttitude({ rollDeg })} />
                    <AngleInput label="Pitch" value={attitude.pitchDeg} maxAbsDeg={attitude.maxPitchDeg} onChange={(pitchDeg) => updateValidatedAttitude({ pitchDeg })} />
                    <AngleInput label="Yaw" value={attitude.yawDeg} maxAbsDeg={attitude.maxYawDeg} onChange={(yawDeg) => updateValidatedAttitude({ yawDeg })} />
                  </>
                )}
                <Form.Item label="外部姿态序列 CSV">
                  <Space wrap size={6}>
                    <Button size="small" onClick={() => attitudeInputRef.current?.click()}>导入姿态序列</Button>
                    {attitude.sequence.length >= 2 && (
                      <Button size="small" danger onClick={() => {
                        updateAttitude({ sequence: [], mode: "fixed" });
                        setAttitudeImportMessage(undefined);
                      }}>清除</Button>
                    )}
                  </Space>
                  <Text type="secondary" className="angle-convention">
                    表头：timeSeconds,rollDeg,pitchDeg,yawDeg；各轴沿最短角路径插值。
                  </Text>
                  {attitude.mode === "external" && attitude.sequence.length >= 2 && (
                    <Text className="angle-convention">
                      当前 {attitude.sequence.length} 点，{attitude.sequence[0].timeSeconds}～{attitude.sequence.at(-1)!.timeSeconds} s
                    </Text>
                  )}
                  {attitudeImportMessage && <Alert type={attitudeImportMessage.type} title={attitudeImportMessage.text} showIcon />}
                  <input
                    hidden
                    ref={attitudeInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importAttitudeSequence(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </Form.Item>
                <Form.Item label="最大滚转角 (deg)">
                  <InputNumber min={0.001} max={180} step={1} value={attitude.maxRollDeg} onChange={(maxRollDeg) => maxRollDeg !== null && updateValidatedAttitude({ maxRollDeg })} />
                </Form.Item>
                <Form.Item label="最大俯仰角 (deg)">
                  <InputNumber min={0.001} max={180} step={1} value={attitude.maxPitchDeg} onChange={(maxPitchDeg) => maxPitchDeg !== null && updateValidatedAttitude({ maxPitchDeg })} />
                </Form.Item>
                <Form.Item label="最大偏航角 (deg)">
                  <InputNumber min={0.001} max={180} step={1} value={attitude.maxYawDeg} onChange={(maxYawDeg) => maxYawDeg !== null && updateValidatedAttitude({ maxYawDeg })} />
                </Form.Item>
                <Form.Item label="最大角速度 (deg/s)">
                  <InputNumber min={0.001} max={100000} step={1} value={attitude.maxAngularRateDegS} onChange={(maxAngularRateDegS) => maxAngularRateDegS !== null && updateValidatedAttitude({ maxAngularRateDegS })} />
                </Form.Item>
                <Form.Item label="最大角加速度 (deg/s²)">
                  <InputNumber min={0.001} max={100000} step={1} value={attitude.maxAngularAccelerationDegS2} onChange={(maxAngularAccelerationDegS2) => maxAngularAccelerationDegS2 !== null && updateValidatedAttitude({ maxAngularAccelerationDegS2 })} />
                </Form.Item>
                <Text type="secondary" className="angle-convention">外部序列按最短角路径计算三轴合成角速度，并以相邻线性段中点计算角加速度。</Text>
                {attitudeLimitMessage && <Alert type="error" showIcon title="姿态限制未应用" description={attitudeLimitMessage} />}
              </Form>
            ),
          },
          {
            key: "antenna",
            label: "固定天线安装",
            children: (
              <Form layout="vertical" size="small" className="parameter-form compact-form">
                <Form.Item label="天线名称">
                  <Input value={antenna.name} onChange={(event) => updateAntenna({ name: event.target.value })} />
                </Form.Item>
                <Form.Item label="任务扫描模式">
                  <Select
                    value={antenna.taskMode}
                    options={[
                      { value: "generic", label: "通用扫描规律" },
                      { value: "stripmap", label: "Stripmap 固定条带" },
                      { value: "spotlight", label: "Spotlight 目标跟踪" },
                      { value: "scanSar", label: "ScanSAR 子测绘带" },
                      { value: "tops", label: "TOPS 方位扫掠" },
                    ]}
                    onChange={(taskMode) => updateAntenna({ taskMode })}
                  />
                </Form.Item>
                {antenna.taskMode === "stripmap" && (
                  <Text type="secondary" className="angle-convention">
                    固定使用下方扫描方位角和俯仰角，形成连续条带。
                  </Text>
                )}
                {antenna.taskMode === "spotlight" && (
                  <>
                    <Form.Item label="Spotlight 跟踪目标">
                      <Select
                        value={antenna.spotlightTargetId || undefined}
                        placeholder="选择地面目标"
                        options={targets.map((target) => ({ value: target.id, label: target.name }))}
                        onChange={(spotlightTargetId) => updateAntenna({ spotlightTargetId })}
                      />
                    </Form.Item>
                    {targets.length === 0 && <Alert type="warning" title="请先在地面目标面板添加 Spotlight 跟踪目标。" showIcon />}
                    <Text type="secondary" className="angle-convention">
                      每个时刻自动计算目标相对天线的指向角；不可见时回退到手动扫描角。
                    </Text>
                  </>
                )}
                {antenna.taskMode === "scanSar" && (
                  <>
                    <Form.Item label="子测绘带俯仰角 (deg)">
                      <Select
                        mode="tags"
                        tokenSeparators={[","]}
                        value={antenna.scanSarElevationAnglesDeg.map(String)}
                        onChange={(values) => {
                          const angles = values.map(Number).filter((value) => Number.isFinite(value) && Math.abs(value) <= 89);
                          if (angles.length > 0) updateAntenna({ scanSarElevationAnglesDeg: angles.slice(0, 32) });
                        }}
                        options={[]}
                      />
                    </Form.Item>
                    <Form.Item label="Burst 驻留时间 (s)">
                      <InputNumber min={0.1} max={3600} step={1} value={antenna.scanSarBurstDurationSeconds} onChange={(scanSarBurstDurationSeconds) => scanSarBurstDurationSeconds !== null && updateAntenna({ scanSarBurstDurationSeconds })} />
                    </Form.Item>
                    <Text type="secondary" className="angle-convention">
                      按输入顺序循环切换子测绘带，方位角采用下方手动值。
                    </Text>
                  </>
                )}
                {antenna.taskMode === "tops" && (
                  <>
                    <Form.Item label="TOPS 起始方位角 (deg)">
                      <InputNumber min={-89} max={89} step={0.5} value={antenna.topsStartAzimuthDeg} onChange={(topsStartAzimuthDeg) => topsStartAzimuthDeg !== null && updateAntenna({ topsStartAzimuthDeg })} />
                    </Form.Item>
                    <Form.Item label="TOPS 终止方位角 (deg)">
                      <InputNumber min={-89} max={89} step={0.5} value={antenna.topsEndAzimuthDeg} onChange={(topsEndAzimuthDeg) => topsEndAzimuthDeg !== null && updateAntenna({ topsEndAzimuthDeg })} />
                    </Form.Item>
                    <Form.Item label="TOPS 单程扫掠时间 (s)">
                      <InputNumber min={0.1} max={3600} step={1} value={antenna.topsSweepDurationSeconds} onChange={(topsSweepDurationSeconds) => topsSweepDurationSeconds !== null && updateAntenna({ topsSweepDurationSeconds })} />
                    </Form.Item>
                    <Text type="secondary" className="angle-convention">
                      方位角从起始值线性扫到终止值后复位，俯仰角采用下方手动值。
                    </Text>
                  </>
                )}
                <Form.Item label="安装位置 Xb (m)">
                  <InputNumber min={-1000} max={1000} step={0.1} value={antenna.mountOffsetXM} onChange={(mountOffsetXM) => mountOffsetXM !== null && updateAntenna({ mountOffsetXM })} />
                </Form.Item>
                <Form.Item label="安装位置 Yb (m)">
                  <InputNumber min={-1000} max={1000} step={0.1} value={antenna.mountOffsetYM} onChange={(mountOffsetYM) => mountOffsetYM !== null && updateAntenna({ mountOffsetYM })} />
                </Form.Item>
                <Form.Item label="安装位置 Zb (m)">
                  <InputNumber min={-1000} max={1000} step={0.1} value={antenna.mountOffsetZM} onChange={(mountOffsetZM) => mountOffsetZM !== null && updateAntenna({ mountOffsetZM })} />
                </Form.Item>
                <AngleInput label="安装 Roll" value={antenna.mountRollDeg} onChange={(mountRollDeg) => updateAntenna({ mountRollDeg })} />
                <AngleInput label="安装 Pitch" value={antenna.mountPitchDeg} onChange={(mountPitchDeg) => updateAntenna({ mountPitchDeg })} />
                <AngleInput label="安装 Yaw" value={antenna.mountYawDeg} onChange={(mountYawDeg) => updateAntenna({ mountYawDeg })} />
                <Form.Item label="波束类型">
                  <Select
                    value={antenna.beamType}
                    options={[
                      { value: "circular", label: "圆锥波束" },
                      { value: "rectangular", label: "矩形角域波束" },
                      { value: "pattern", label: "二维增益方向图", disabled: antenna.gainPattern === null },
                    ]}
                    onChange={(beamType) => updateAntenna({ beamType })}
                  />
                </Form.Item>
                <Form.Item label="二维方向图 CSV / JSON">
                  <Space wrap size={6}>
                    <Button size="small" onClick={() => patternInputRef.current?.click()}>导入方向图</Button>
                    {antenna.gainPattern && (
                      <Button size="small" danger onClick={() => {
                        updateAntenna({ gainPattern: null, beamType: "circular" });
                        setPatternImportMessage(undefined);
                      }}>清除</Button>
                    )}
                  </Space>
                  <Text type="secondary" className="angle-convention">
                    CSV 长表：azimuthDeg,elevationDeg,gainDb；JSON 使用角度轴和二维 gainDb 网格。
                  </Text>
                  {antenna.gainPattern && (
                    <Text className="angle-convention">
                      当前：{antenna.gainPattern.name} · {antenna.gainPattern.azimuthAnglesDeg.length} × {antenna.gainPattern.elevationAnglesDeg.length} 点
                    </Text>
                  )}
                  {patternImportMessage && <Alert type={patternImportMessage.type} title={patternImportMessage.text} showIcon />}
                  <input
                    hidden
                    ref={patternInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importGainPattern(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </Form.Item>
                <Form.Item label="扫描方位角 (deg)">
                  <InputNumber min={-antenna.maxScanAngleDeg} max={antenna.maxScanAngleDeg} step={0.5} value={antenna.steeringAzimuthDeg} onChange={(steeringAzimuthDeg) => steeringAzimuthDeg !== null && updateAntenna({ steeringAzimuthDeg })} />
                </Form.Item>
                <Form.Item label="扫描俯仰角 (deg)">
                  <InputNumber min={-antenna.maxScanAngleDeg} max={antenna.maxScanAngleDeg} step={0.5} value={antenna.steeringElevationDeg} onChange={(steeringElevationDeg) => steeringElevationDeg !== null && updateAntenna({ steeringElevationDeg })} />
                </Form.Item>
                <Form.Item label="最大扫描角 (deg)">
                  <InputNumber min={0.1} max={89} step={1} value={antenna.maxScanAngleDeg} onChange={(maxScanAngleDeg) => maxScanAngleDeg !== null && updateAntenna({ maxScanAngleDeg })} />
                </Form.Item>
                <Text type="secondary" className="angle-convention">
                  正方位角朝 +Xa，正俯仰角朝 +Ya；0° 沿天线 +Za。
                </Text>
                {antenna.taskMode === "generic" && <><Form.Item label="扫描规律">
                  <Select
                    value={antenna.scanMode}
                    options={[
                      { value: "fixed", label: "固定指向" },
                      { value: "sine", label: "正弦扫描" },
                      { value: "linear", label: "线性往返扫描" },
                      { value: "custom", label: "自定义角度时间表", disabled: antenna.steeringTable.length < 2 },
                    ]}
                    onChange={(scanMode) => updateAntenna({ scanMode })}
                  />
                </Form.Item>
                {(antenna.scanMode === "sine" || antenna.scanMode === "linear") && (
                  <>
                    <Form.Item label="周期扫描轴">
                      <Select
                        value={antenna.scanAxis}
                        options={[
                          { value: "azimuth", label: "方位轴" },
                          { value: "elevation", label: "俯仰轴" },
                        ]}
                        onChange={(scanAxis) => updateAntenna({ scanAxis })}
                      />
                    </Form.Item>
                    <Form.Item label="扫描幅度 (deg)">
                      <InputNumber min={0} max={antenna.maxScanAngleDeg} step={0.5} value={antenna.scanAmplitudeDeg} onChange={(scanAmplitudeDeg) => scanAmplitudeDeg !== null && updateAntenna({ scanAmplitudeDeg })} />
                    </Form.Item>
                    <Form.Item label="扫描周期 (s)">
                      <InputNumber min={1} max={3600} step={1} value={antenna.scanPeriodSeconds} onChange={(scanPeriodSeconds) => scanPeriodSeconds !== null && updateAntenna({ scanPeriodSeconds })} />
                    </Form.Item>
                    <Form.Item label="初始扫描相位 (deg)">
                      <InputNumber min={-360} max={360} step={5} value={antenna.scanPhaseDeg} onChange={(scanPhaseDeg) => scanPhaseDeg !== null && updateAntenna({ scanPhaseDeg })} />
                    </Form.Item>
                  </>
                )}
                <Form.Item label="自定义扫描时间表 CSV">
                  <Space wrap size={6}>
                    <Button size="small" onClick={() => steeringInputRef.current?.click()}>导入时间表</Button>
                    {antenna.steeringTable.length >= 2 && (
                      <Button size="small" danger onClick={() => {
                        updateAntenna({ steeringTable: [], scanMode: "fixed" });
                        setSteeringImportMessage(undefined);
                      }}>清除</Button>
                    )}
                  </Space>
                  <Text type="secondary" className="angle-convention">
                    表头：timeSeconds,azimuthDeg,elevationDeg；线性插值，范围外保持端点。
                  </Text>
                  {antenna.scanMode === "custom" && antenna.steeringTable.length >= 2 && (
                    <Text className="angle-convention">
                      当前 {antenna.steeringTable.length} 点，{antenna.steeringTable[0].timeSeconds}～{antenna.steeringTable.at(-1)!.timeSeconds} s
                    </Text>
                  )}
                  {steeringImportMessage && (
                    <Alert type={steeringImportMessage.type} title={steeringImportMessage.text} showIcon />
                  )}
                  <input
                    hidden
                    ref={steeringInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importSteeringTable(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </Form.Item></>}
                {antenna.beamType === "circular" ? (
                  <Form.Item label="圆锥全波束宽度 (deg)">
                    <InputNumber min={0.1} max={30} step={0.1} value={antenna.circularBeamwidthDeg} onChange={(circularBeamwidthDeg) => circularBeamwidthDeg !== null && updateAntenna({ circularBeamwidthDeg })} />
                  </Form.Item>
                ) : antenna.beamType === "rectangular" ? (
                  <>
                    <Form.Item label="方位全波束宽度 (deg)">
                      <InputNumber min={0.1} max={30} step={0.1} value={antenna.azimuthBeamwidthDeg} onChange={(azimuthBeamwidthDeg) => azimuthBeamwidthDeg !== null && updateAntenna({ azimuthBeamwidthDeg })} />
                    </Form.Item>
                    <Form.Item label="俯仰全波束宽度 (deg)">
                      <InputNumber min={0.1} max={30} step={0.1} value={antenna.elevationBeamwidthDeg} onChange={(elevationBeamwidthDeg) => elevationBeamwidthDeg !== null && updateAntenna({ elevationBeamwidthDeg })} />
                    </Form.Item>
                  </>
                ) : (
                  <>
                    <Form.Item label="相对峰值门限衰减 (dB)">
                      <InputNumber min={0.01} max={100} step={0.5} value={antenna.patternThresholdDbBelowPeak} onChange={(patternThresholdDbBelowPeak) => patternThresholdDbBelowPeak !== null && updateAntenna({ patternThresholdDbBelowPeak })} />
                    </Form.Item>
                    <Text type="secondary" className="angle-convention">
                      3 dB、10 dB 或自定义衰减门限从全局峰值提取主瓣边界；断开旁瓣不计入覆盖区。
                    </Text>
                  </>
                )}
                <Form.Item label="边界采样数">
                  <InputNumber min={64} max={128} step={8} precision={0} value={antenna.boundarySamples} onChange={(boundarySamples) => boundarySamples !== null && updateAntenna({ boundarySamples })} />
                </Form.Item>
                <Form.Item label="无交点时最远显示距离 (km)">
                  <InputNumber min={100} max={5000} step={100} value={antenna.maxDisplayDistanceM / 1000} onChange={(value) => value !== null && updateAntenna({ maxDisplayDistanceM: value * 1000 })} />
                </Form.Item>
                <Form.Item label="波束颜色">
                  <Input type="color" value={antenna.beamColor} onChange={(event) => updateAntenna({ beamColor: event.target.value })} />
                </Form.Item>
                <Form.Item label="波束透明度">
                  <InputNumber min={0.01} max={1} step={0.05} value={antenna.beamOpacity} onChange={(beamOpacity) => beamOpacity !== null && updateAntenna({ beamOpacity })} />
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </section>
  );
}

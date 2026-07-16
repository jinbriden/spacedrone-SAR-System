import { Alert, Button, Descriptions, Form, InputNumber, Select, Space, Switch, Typography } from "antd";
import { deriveSarSystemParameters, SAR_IMAGING_ALGORITHMS } from "@spacedrone/orbital-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBinaryFile, downloadTextFile, timestampedFileName } from "../io/browserFiles";
import { sarAnalysisToCsv } from "../io/sarExport";
import { sarEchoToBinary } from "../io/sarEchoExport";
import { sarDbfToBinary, sarSpectrumToCsv } from "../io/sarDbfExport";
import { useSimulationStore } from "../stores/simulationStore";
import { runSarAnalysisWorker } from "../workers/sarAnalysisWorkerClient";
import type { SarAnalysisResult } from "../workers/sarAnalysis";
import { runSarEchoWorker } from "../workers/sarEchoWorkerClient";
import type { SarEchoResult } from "../workers/sarEcho";
import { runSarDbfWorker } from "../workers/sarDbfWorkerClient";
import type { SarDbfAnalysisResult } from "../workers/sarDbf";
import { runSarImagingWorker } from "../workers/sarImagingWorkerClient";
import type { SarImagingResult } from "../workers/sarImaging";
import { sarImageToBinary } from "../io/sarImagingExport";

const { Text, Title } = Typography;

function curvePath(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1e-12, maximum - minimum);
  return values.map((value, index) => {
    const x = 8 + index / (values.length - 1) * (width - 16);
    const y = 8 + (maximum - value) / span * (height - 16);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function RangeDopplerPlot({ result }: { result: SarAnalysisResult }) {
  const maximumPoints = 700;
  const step = Math.max(1, Math.ceil(result.history.samples.length / maximumPoints));
  const samples = result.history.samples.filter((_, index) => index % step === 0 || index === result.history.samples.length - 1);
  const width = 360;
  const height = 130;
  return <div>
    <Text strong>斜距历程（青）/ 多普勒历程（黄）</Text>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="SAR 斜距和多普勒历程" style={{ width: "100%", background: "#07111d", borderRadius: 4 }}>
      <path d={curvePath(samples.map((sample) => sample.slantRangeM), width, height)} fill="none" stroke="#36cfc9" strokeWidth="2" />
      <path d={curvePath(samples.map((sample) => sample.dopplerHz), width, height)} fill="none" stroke="#fadb14" strokeWidth="1.5" />
    </svg>
  </div>;
}

function EchoPreview({ result }: { result: SarEchoResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const image = new ImageData(width, height);
    const { pulseCount, fastTimeSampleCount, inPhase, quadrature, peakMagnitude } = result.echo;
    for (let y = 0; y < height; y += 1) {
      const pulse = Math.min(pulseCount - 1, Math.floor(y / height * pulseCount));
      for (let x = 0; x < width; x += 1) {
        const fast = Math.min(fastTimeSampleCount - 1, Math.floor(x / width * fastTimeSampleCount));
        const index = pulse * fastTimeSampleCount + fast;
        const magnitude = Math.hypot(inPhase[index], quadrature[index]);
        const normalized = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-12, magnitude / Math.max(1e-12, peakMagnitude))) + 60) / 60));
        const pixel = (y * width + x) * 4;
        image.data[pixel] = Math.round(255 * normalized);
        image.data[pixel + 1] = Math.round(255 * Math.sqrt(normalized));
        image.data[pixel + 2] = Math.round(180 * (1 - normalized));
        image.data[pixel + 3] = 255;
      }
    }
    canvas.getContext("2d")?.putImageData(image, 0, 0);
  }, [result]);
  return <div>
    <Text strong>原始回波幅度（横轴快时间，纵轴慢时间，动态范围 60 dB）</Text>
    <canvas ref={canvasRef} width={480} height={220} style={{ width: "100%", imageRendering: "pixelated", background: "#07111d", borderRadius: 4 }} />
  </div>;
}

function DbfPreview({ result }: { result: SarDbfAnalysisResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const image = new ImageData(width, height);
    const { pulseCount, fastTimeSampleCount } = result.multiChannelEcho;
    const peak = Math.max(1e-12, result.dbf.peakMagnitude);
    for (let y = 0; y < height; y += 1) {
      const pulse = Math.min(pulseCount - 1, Math.floor(y / height * pulseCount));
      for (let x = 0; x < width; x += 1) {
        const fast = Math.min(fastTimeSampleCount - 1, Math.floor(x / width * fastTimeSampleCount));
        const index = pulse * fastTimeSampleCount + fast;
        const magnitude = Math.hypot(result.dbf.inPhase[index], result.dbf.quadrature[index]);
        const normalized = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-12, magnitude / peak)) + 60) / 60));
        const pixel = (y * width + x) * 4;
        image.data[pixel] = Math.round(80 * normalized);
        image.data[pixel + 1] = Math.round(255 * normalized);
        image.data[pixel + 2] = Math.round(255 * Math.sqrt(normalized));
        image.data[pixel + 3] = 255;
      }
    }
    canvas.getContext("2d")?.putImageData(image, 0, 0);
  }, [result]);
  const spectrumValues = Array.from(result.spectrum.magnitude);
  return <div>
    <Text strong>DBF 合成回波（60 dB）</Text>
    <canvas ref={canvasRef} width={480} height={180} style={{ width: "100%", imageRendering: "pixelated", background: "#07111d", borderRadius: 4 }} />
    <Text strong>重构方位频谱</Text>
    <svg viewBox="0 0 360 120" role="img" aria-label="重构方位频谱" style={{ width: "100%", background: "#07111d", borderRadius: 4 }}>
      <path d={curvePath(spectrumValues, 360, 120)} fill="none" stroke="#b37feb" strokeWidth="1.5" />
    </svg>
  </div>;
}

function FocusedImagePreview({ result }: { result: SarImagingResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const image = new ImageData(width, height);
    const focused = result.image;
    for (let y = 0; y < height; y += 1) {
      const azimuth = Math.min(focused.azimuthPixelCount - 1, Math.floor(y / height * focused.azimuthPixelCount));
      for (let x = 0; x < width; x += 1) {
        const range = Math.min(focused.rangePixelCount - 1, Math.floor(x / width * focused.rangePixelCount));
        const db = focused.intensityDb[azimuth * focused.rangePixelCount + range];
        const normalized = Math.max(0, Math.min(1, (db + 80) / 80));
        const pixel = (y * width + x) * 4;
        image.data[pixel] = Math.round(255 * Math.min(1, normalized * 1.6));
        image.data[pixel + 1] = Math.round(255 * normalized ** 0.65);
        image.data[pixel + 2] = Math.round(255 * Math.max(0, 1 - Math.abs(normalized - 0.35) * 2.5));
        image.data[pixel + 3] = 255;
      }
    }
    canvas.getContext("2d")?.putImageData(image, 0, 0);
  }, [result]);
  return <div>
    <Text strong>聚焦强度图（横轴距离，纵轴方位，-80～0 dB）</Text>
    <canvas ref={canvasRef} width={520} height={260} style={{ width: "100%", imageRendering: "pixelated", background: "#07111d", borderRadius: 4 }} />
  </div>;
}

export function SarAnalysisPanel() {
  const orbit = useSimulationStore((state) => state.orbit);
  const targets = useSimulationStore((state) => state.targets);
  const config = useSimulationStore((state) => state.sar);
  const updateSar = useSimulationStore((state) => state.updateSar);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SarAnalysisResult>();
  const [error, setError] = useState<string>();
  const [echoRunning, setEchoRunning] = useState(false);
  const [echoResult, setEchoResult] = useState<SarEchoResult>();
  const [dbfRunning, setDbfRunning] = useState(false);
  const [dbfResult, setDbfResult] = useState<SarDbfAnalysisResult>();
  const [imagingRunning, setImagingRunning] = useState(false);
  const [imagingResult, setImagingResult] = useState<SarImagingResult>();
  const derived = useMemo(() => {
    try { return { value: deriveSarSystemParameters(config) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : "SAR 参数无效。" }; }
  }, [config]);
  const target = targets.find((item) => item.id === config.targetId);
  useEffect(() => { setResult(undefined); setEchoResult(undefined); setDbfResult(undefined); setImagingResult(undefined); setError(undefined); }, [config, orbit, targets]);

  const run = async () => {
    if (!target) return;
    setRunning(true); setError(undefined);
    try { setResult(await runSarAnalysisWorker({ orbit, target, config })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "SAR 分析失败。"); }
    finally { setRunning(false); }
  };
  const generateEcho = async () => {
    if (!target) return;
    setEchoRunning(true); setError(undefined);
    try { setEchoResult(await runSarEchoWorker({ orbit, target, config })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "SAR 回波生成失败。"); }
    finally { setEchoRunning(false); }
  };
  const runDbf = async () => {
    if (!target) return;
    setDbfRunning(true); setError(undefined);
    try { setDbfResult(await runSarDbfWorker({ orbit, target, config })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "SAR DBF 分析失败。"); }
    finally { setDbfRunning(false); }
  };
  const runImaging = async () => {
    if (!target) return;
    setImagingRunning(true); setError(undefined);
    try { setImagingResult(await runSarImagingWorker({ orbit, target, config })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "SAR 成像失败。"); }
    finally { setImagingRunning(false); }
  };

  return <section className="panel-section sar-analysis-panel">
    <Title level={4}>SAR 快慢时间与多普勒</Title>
    <Text type="secondary">按 PRF 对主星真实 ECEF 轨道状态采样；目标固定在地球坐标系，计算单基地双程时延、斜距速度和多普勒。</Text>
    <Form layout="vertical" size="small" className="parameter-form">
      <Form.Item label="分析目标"><Select value={config.targetId || undefined} placeholder="选择目标" options={targets.map((item) => ({ value: item.id, label: item.name }))} onChange={(targetId) => updateSar({ targetId })} /></Form.Item>
      <Form.Item label="孔径中心仿真时刻 (s)"><InputNumber min={0} value={config.analysisCenterSeconds} onChange={(analysisCenterSeconds) => analysisCenterSeconds !== null && updateSar({ analysisCenterSeconds })} /></Form.Item>
      <Form.Item label="载频 (GHz)"><InputNumber min={0.001} step={0.1} value={config.carrierFrequencyHz / 1e9} onChange={(value) => value !== null && updateSar({ carrierFrequencyHz: value * 1e9 })} /></Form.Item>
      <Form.Item label="线性调频带宽 (MHz)"><InputNumber min={0.001} step={10} value={config.chirpBandwidthHz / 1e6} onChange={(value) => value !== null && updateSar({ chirpBandwidthHz: value * 1e6 })} /></Form.Item>
      <Form.Item label="脉冲宽度 (μs)"><InputNumber min={0.001} step={1} value={config.pulseWidthSeconds * 1e6} onChange={(value) => value !== null && updateSar({ pulseWidthSeconds: value / 1e6 })} /></Form.Item>
      <Form.Item label="PRF (Hz)"><InputNumber min={0.001} step={100} value={config.prfHz} onChange={(prfHz) => prfHz !== null && updateSar({ prfHz })} /></Form.Item>
      <Form.Item label="复基带采样率 (MHz)"><InputNumber min={0.001} step={10} value={config.samplingRateHz / 1e6} onChange={(value) => value !== null && updateSar({ samplingRateHz: value * 1e6 })} /></Form.Item>
      <Form.Item label="合成孔径时间 (s)"><InputNumber min={0.001} step={0.1} value={config.apertureDurationSeconds} onChange={(apertureDurationSeconds) => apertureDurationSeconds !== null && updateSar({ apertureDurationSeconds })} /></Form.Item>
      <Form.Item label="快时间窗单侧余量 (μs)"><InputNumber min={0} step={1} value={config.fastTimeMarginSeconds * 1e6} onChange={(value) => value !== null && updateSar({ fastTimeMarginSeconds: value / 1e6 })} /></Form.Item>
      <Form.Item label="回波连续脉冲数"><InputNumber min={2} max={4096} precision={0} value={config.echoPulseCount} onChange={(echoPulseCount) => echoPulseCount !== null && updateSar({ echoPulseCount })} /></Form.Item>
      <Form.Item label="点目标 RCS (m²)"><InputNumber min={1e-9} step={0.1} value={config.targetRcsM2} onChange={(targetRcsM2) => targetRcsM2 !== null && updateSar({ targetRcsM2 })} /></Form.Item>
      <Form.Item label="复噪声标准差（归一化）"><InputNumber min={0} step={0.01} value={config.noiseStandardDeviation} onChange={(noiseStandardDeviation) => noiseStandardDeviation !== null && updateSar({ noiseStandardDeviation })} /></Form.Item>
      <Form.Item label="噪声随机种子"><InputNumber min={0} max={4_294_967_295} precision={0} value={config.randomSeed} onChange={(randomSeed) => randomSeed !== null && updateSar({ randomSeed })} /></Form.Item>
      <Form.Item label="按 PRI 折叠距离模糊"><Switch checked={config.foldRangeAmbiguity} onChange={(foldRangeAmbiguity) => updateSar({ foldRangeAmbiguity })} /></Form.Item>
      <Form.Item label="沿轨接收通道数"><InputNumber min={2} max={32} precision={0} value={config.receiveChannelCount} onChange={(receiveChannelCount) => receiveChannelCount !== null && updateSar({ receiveChannelCount })} /></Form.Item>
      <Form.Item label="通道沿轨间距 (m)"><InputNumber min={0.001} step={0.1} value={config.receiveChannelSpacingM} onChange={(receiveChannelSpacingM) => receiveChannelSpacingM !== null && updateSar({ receiveChannelSpacingM })} /></Form.Item>
      <Form.Item label="多通道连续脉冲数"><InputNumber min={2} max={512} precision={0} value={config.multiChannelPulseCount} onChange={(multiChannelPulseCount) => multiChannelPulseCount !== null && updateSar({ multiChannelPulseCount })} /></Form.Item>
      <Form.Item label="DBF 指向多普勒 (Hz)"><InputNumber step={100} value={config.dbfSteeringDopplerHz} onChange={(dbfSteeringDopplerHz) => dbfSteeringDopplerHz !== null && updateSar({ dbfSteeringDopplerHz })} /></Form.Item>
      <Form.Item label="成像算法"><Select value={config.imagingAlgorithmId} options={SAR_IMAGING_ALGORITHMS.map((algorithm) => ({ value: algorithm.id, label: algorithm.name }))} onChange={(imagingAlgorithmId) => updateSar({ imagingAlgorithmId: imagingAlgorithmId as typeof config.imagingAlgorithmId })} /></Form.Item>
      <Form.Item label="成像最大距离像素"><InputNumber min={16} max={4096} precision={0} value={config.imagingMaximumRangePixels} onChange={(imagingMaximumRangePixels) => imagingMaximumRangePixels !== null && updateSar({ imagingMaximumRangePixels })} /></Form.Item>
    </Form>
    {derived.error && <Alert type="error" showIcon title="SAR 参数无效" description={derived.error} />}
    {derived.value && <Descriptions size="small" column={1} colon={false}>
      <Descriptions.Item label="波长">{derived.value.wavelengthM.toFixed(5)} m</Descriptions.Item>
      <Descriptions.Item label="理论距离分辨率">{derived.value.rangeResolutionM.toFixed(3)} m</Descriptions.Item>
      <Descriptions.Item label="最大无模糊距离">{(derived.value.unambiguousRangeM / 1000).toFixed(3)} km</Descriptions.Item>
      <Descriptions.Item label="最大无模糊径向速度">±{derived.value.unambiguousRadialVelocityMps.toFixed(3)} m/s</Descriptions.Item>
      <Descriptions.Item label="占空比 / 时宽带宽积">{(derived.value.dutyCycle * 100).toFixed(3)}% / {derived.value.timeBandwidthProduct.toFixed(1)}</Descriptions.Item>
      <Descriptions.Item label="慢时间采样点">{derived.value.slowTimeSampleCount.toLocaleString()}</Descriptions.Item>
    </Descriptions>}
    <Button type="primary" block loading={running} disabled={!target || Boolean(derived.error)} onClick={() => void run()}>计算斜距与多普勒历程</Button>
    <Button block loading={echoRunning} disabled={!target || Boolean(derived.error)} onClick={() => void generateEcho()}>生成 LFM 复回波</Button>
    <Button block loading={dbfRunning} disabled={!target || Boolean(derived.error)} onClick={() => void runDbf()}>运行多通道 DBF / 频谱重构</Button>
    <Button block loading={imagingRunning} disabled={!target || Boolean(derived.error) || config.echoPulseCount > 256} onClick={() => void runImaging()}>运行参考 SAR 聚焦</Button>
    {config.echoPulseCount > 256 && <Alert type="warning" showIcon title="参考成像最多处理 256 个脉冲" description="请减小“回波连续脉冲数”；斜距分析和回波导出仍可使用更大的脉冲数。" />}
    {!target && <Alert type="info" showIcon title="请先选择一个地面目标" />}
    {error && <Alert type="error" showIcon title="SAR 分析失败" description={error} />}
    {result && <Space orientation="vertical" style={{ width: "100%" }}>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="孔径 UTC">{result.startUtc} ～ {result.endUtc}</Descriptions.Item>
        <Descriptions.Item label="最近斜距 / 时刻">{(result.history.minimumRangeM / 1000).toFixed(3)} km / T+{result.history.closestApproach.slowTimeSeconds.toFixed(6)} s</Descriptions.Item>
        <Descriptions.Item label="多普勒中心 / 带宽">{result.history.dopplerCentroidHz.toFixed(3)} / {result.history.dopplerBandwidthHz.toFixed(3)} Hz</Descriptions.Item>
        <Descriptions.Item label="快时间窗">{(result.history.fastTimeStartSeconds * 1e3).toFixed(6)} ～ {(result.history.fastTimeEndSeconds * 1e3).toFixed(6)} ms</Descriptions.Item>
        <Descriptions.Item label="快时间采样点">{result.history.fastTimeSampleCount.toLocaleString()}</Descriptions.Item>
      </Descriptions>
      <RangeDopplerPlot result={result} />
      <Button size="small" onClick={() => downloadTextFile(timestampedFileName("spacedrone-sar-range-doppler", "csv"), sarAnalysisToCsv(result), "text/csv")}>导出斜距/多普勒 CSV</Button>
    </Space>}
    {echoResult && <Space orientation="vertical" style={{ width: "100%" }}>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="回波矩阵">{echoResult.echo.pulseCount} × {echoResult.echo.fastTimeSampleCount.toLocaleString()}（{echoResult.echo.inPhase.length.toLocaleString()} 复点）</Descriptions.Item>
        <Descriptions.Item label="峰值幅度 / 平均功率">{echoResult.echo.peakMagnitude.toExponential(4)} / {echoResult.echo.meanPower.toExponential(4)}</Descriptions.Item>
        <Descriptions.Item label="距离模糊">阶数 ≤ {echoResult.echo.ambiguity.maximumRangeAmbiguityOrder} · {echoResult.echo.ambiguity.rangeAmbiguous ? "存在折叠" : "无折叠"}</Descriptions.Item>
        <Descriptions.Item label="方位模糊">阶数 ≤ {echoResult.echo.ambiguity.maximumAzimuthAmbiguityOrder} · 估计 {echoResult.echo.ambiguity.estimatedAzimuthReplicaCount} 个谱副本</Descriptions.Item>
      </Descriptions>
      <EchoPreview result={echoResult} />
      <Button size="small" onClick={() => downloadBinaryFile(timestampedFileName("spacedrone-sar-echo", "spdriq"), sarEchoToBinary(echoResult))}>导出 SPDRIQ1 交织 Float32</Button>
    </Space>}
    {dbfResult && <Space orientation="vertical" style={{ width: "100%" }}>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="多通道数据立方体">{dbfResult.multiChannelEcho.channelCount} × {dbfResult.multiChannelEcho.pulseCount} × {dbfResult.multiChannelEcho.fastTimeSampleCount.toLocaleString()}</Descriptions.Item>
        <Descriptions.Item label="相位中心">{Array.from(dbfResult.multiChannelEcho.channelOffsetsM).map((value) => value.toFixed(3)).join(", ")} m</Descriptions.Item>
        <Descriptions.Item label="DBF 复权">{Array.from(dbfResult.dbf.weightReal).map((value, index) => `${value.toFixed(3)}${dbfResult.dbf.weightImag[index] < 0 ? "" : "+"}${dbfResult.dbf.weightImag[index].toFixed(3)}j`).join("；")}</Descriptions.Item>
        <Descriptions.Item label="重构频率范围">{(dbfResult.spectrum.frequencyHz[0] / 1000).toFixed(3)} ～ {(dbfResult.spectrum.frequencyHz.at(-1)! / 1000).toFixed(3)} kHz</Descriptions.Item>
        <Descriptions.Item label="最小消元主元">{dbfResult.spectrum.minimumPivotMagnitude.toExponential(3)}</Descriptions.Item>
      </Descriptions>
      <DbfPreview result={dbfResult} />
      <Space wrap>
        <Button size="small" onClick={() => downloadTextFile(timestampedFileName("spacedrone-sar-reconstructed-spectrum", "csv"), sarSpectrumToCsv(dbfResult), "text/csv")}>导出重构频谱 CSV</Button>
        <Button size="small" onClick={() => downloadBinaryFile(timestampedFileName("spacedrone-sar-dbf", "spdrdb"), sarDbfToBinary(dbfResult))}>导出 SPDRDB1 多通道/DBF I/Q</Button>
      </Space>
    </Space>}
    {imagingResult && <Space orientation="vertical" style={{ width: "100%" }}>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="算法">{imagingResult.image.algorithmName}</Descriptions.Item>
        <Descriptions.Item label="图像尺寸">{imagingResult.image.azimuthPixelCount} × {imagingResult.image.rangePixelCount}</Descriptions.Item>
        <Descriptions.Item label="峰值像素">方位 {imagingResult.image.peakAzimuthIndex} / 距离 {imagingResult.image.peakRangeIndex}</Descriptions.Item>
        <Descriptions.Item label="方位 / 距离 PSLR">{Number.isFinite(imagingResult.image.azimuthPslrDb) ? imagingResult.image.azimuthPslrDb.toFixed(2) : "—"} / {Number.isFinite(imagingResult.image.rangePslrDb) ? imagingResult.image.rangePslrDb.toFixed(2) : "—"} dB</Descriptions.Item>
        <Descriptions.Item label="方位 3 dB 宽度">{(imagingResult.image.azimuthResolutionSeconds * 1000).toFixed(4)} ms</Descriptions.Item>
        <Descriptions.Item label="距离 3 dB 宽度">{imagingResult.image.rangeResolutionM.toFixed(3)} m</Descriptions.Item>
      </Descriptions>
      <FocusedImagePreview result={imagingResult} />
      <Button size="small" onClick={() => downloadBinaryFile(timestampedFileName("spacedrone-sar-image", "spdrimg"), sarImageToBinary(imagingResult))}>导出 SPDRIMG1 聚焦图像</Button>
    </Space>}
    <Alert type="warning" showIcon title="当前信号级边界" description="参考成像完成 FFT 距离压缩、最近邻 RCMC、双程相位补偿和慢时间相关，适合作为算法接口基准；尚未包含高精度插值、分布式场景、完整 RDA/CSA 或自聚焦。" />
  </section>;
}

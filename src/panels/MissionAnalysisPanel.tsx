import { Alert, Button, Descriptions, Form, InputNumber, Space, Table, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { downloadTextFile, timestampedFileName } from "../io/browserFiles";
import { revisitAnalysisToCsv } from "../io/revisitExport";
import { useSimulationStore } from "../stores/simulationStore";
import { runRevisitAnalysisWorker } from "../workers/revisitWorkerClient";
import type { RevisitAnalysisResult } from "../workers/revisitAnalysis";

const { Text, Title } = Typography;
const secondsOrDash = (value: number | undefined) => value === undefined ? "—" : `${value.toFixed(1)} s`;

export function MissionAnalysisPanel() {
  const orbit = useSimulationStore((state) => state.orbit);
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const targets = useSimulationStore((state) => state.targets);
  const companionSatellites = useSimulationStore((state) => state.companionSatellites);
  const terrain = useSimulationStore((state) => state.terrain);
  const settings = useSimulationStore((state) => state.missionSettings);
  const updateSettings = useSimulationStore((state) => state.updateMissionSettings);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RevisitAnalysisResult>();
  const [error, setError] = useState<string>();
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const invalidRange = settings.revisitEndSeconds <= settings.revisitStartSeconds;
  const invalidTolerance = settings.revisitTransitionToleranceSeconds > settings.revisitSampleStepSeconds;

  useEffect(() => { setResult(undefined); setError(undefined); }, [orbit, attitude, antenna, companionSatellites, targets, terrain, settings.revisitStartSeconds, settings.revisitEndSeconds, settings.revisitSampleStepSeconds, settings.revisitTransitionToleranceSeconds]);
  const selected = useMemo(() => result?.targets.find((target) => target.targetId === selectedTargetId) ?? result?.targets[0], [result, selectedTargetId]);

  const run = async () => {
    setRunning(true); setError(undefined);
    try {
      const analysis = await runRevisitAnalysisWorker({
        orbit, attitude, antenna, targets, companionSatellites, terrain,
        startSeconds: settings.revisitStartSeconds,
        endSeconds: settings.revisitEndSeconds,
        sampleStepSeconds: settings.revisitSampleStepSeconds,
        transitionToleranceSeconds: settings.revisitTransitionToleranceSeconds,
      });
      setResult(analysis); setSelectedTargetId(analysis.targets[0]?.targetId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重访分析失败。");
    } finally { setRunning(false); }
  };

  return <section className="panel-section mission-analysis-panel">
    <Title level={4}>可见性与重访分析</Title>
    <Text type="secondary">粗采样发现状态变化，再按容差二分细化访问窗口边界。</Text>
    <Alert type="warning" showIcon title="采样分辨率约束" description="短于粗采样步长且未命中采样时刻的访问窗口可能漏检；窄波束分析请减小步长。边界容差只约束已检测窗口的进入/离开时刻。" />
    <Form layout="vertical" size="small" className="parameter-form">
      <Form.Item label="分析起始时间 (s)"><InputNumber min={0} value={settings.revisitStartSeconds} onChange={(value) => value !== null && updateSettings({ revisitStartSeconds: value })} /></Form.Item>
      <Form.Item label="分析结束时间 (s)" validateStatus={invalidRange ? "error" : undefined}><InputNumber min={0} value={settings.revisitEndSeconds} onChange={(value) => value !== null && updateSettings({ revisitEndSeconds: value })} /></Form.Item>
      <Form.Item label="粗采样步长 (s)"><InputNumber min={0.01} value={settings.revisitSampleStepSeconds} onChange={(value) => value !== null && updateSettings({ revisitSampleStepSeconds: value })} /></Form.Item>
      <Form.Item label="窗口边界容差 (s)" validateStatus={invalidTolerance ? "error" : undefined}><InputNumber min={0.001} value={settings.revisitTransitionToleranceSeconds} onChange={(value) => value !== null && updateSettings({ revisitTransitionToleranceSeconds: value })} /></Form.Item>
      <Button type="primary" block loading={running} disabled={targets.length === 0 || invalidRange || invalidTolerance} onClick={() => void run()}>分析全部目标</Button>
    </Form>
    {targets.length === 0 && <Alert type="info" showIcon title="请先添加至少一个目标" />}
    {error && <Alert type="error" showIcon title="分析失败" description={error} />}
    {result && <>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="UTC 范围">{result.startUtc} ～ {result.endUtc}</Descriptions.Item>
        <Descriptions.Item label="启用卫星 / 粗采样点">{result.satelliteCount} / {result.coarseSampleCount}</Descriptions.Item>
        <Descriptions.Item label="窗口边界精度">≤ {result.transitionToleranceSeconds} s</Descriptions.Item>
      </Descriptions>
      <Table
        size="small" rowKey="targetId" pagination={false} scroll={{ x: 620 }} dataSource={result.targets}
        rowSelection={{ type: "radio", selectedRowKeys: selected ? [selected.targetId] : [], onChange: (keys) => setSelectedTargetId(String(keys[0])) }}
        columns={[
          { title: "目标", dataIndex: "targetName", width: 110 },
          { title: "覆盖次数", width: 80, render: (_, row) => row.coverageStatistics.accessCount },
          { title: "覆盖率", width: 75, render: (_, row) => `${(row.coverageStatistics.coverageFraction * 100).toFixed(3)}%` },
          { title: "平均重访", width: 95, render: (_, row) => secondsOrDash(row.coverageStatistics.meanRevisitSeconds) },
          { title: "最大空档", width: 95, render: (_, row) => secondsOrDash(row.coverageStatistics.maxUncoveredGapSeconds) },
          { title: "可见次数", width: 80, render: (_, row) => row.visibilityStatistics.accessCount },
        ]}
      />
      <Text strong>逐星覆盖次数</Text>
      <Table
        size="small" pagination={false} rowKey={(row) => `${row.satelliteId}-${row.targetId}`} scroll={{ x: 360 }}
        dataSource={result.satellites.flatMap((satellite) => satellite.targets.map((target) => ({ ...target, satelliteId: satellite.satelliteId, satelliteName: satellite.satelliteName })))}
        columns={[
          { title: "卫星", dataIndex: "satelliteName" },
          { title: "目标", dataIndex: "targetName" },
          { title: "覆盖次数", render: (_, row) => row.coverageStatistics.accessCount },
          { title: "覆盖率", render: (_, row) => `${(row.coverageStatistics.coverageFraction * 100).toFixed(3)}%` },
        ]}
      />
      {selected && <>
        <Text strong>{selected.targetName} 的波束覆盖窗口</Text>
        <Table
          size="small" pagination={{ pageSize: 5, size: "small" }} rowKey={(window) => `${window.startSeconds}-${window.endSeconds}`} dataSource={selected.coverageWindows}
          columns={[
            { title: "开始 (s)", render: (_, window) => window.startSeconds.toFixed(2) },
            { title: "结束 (s)", render: (_, window) => window.endSeconds.toFixed(2) },
            { title: "持续 (s)", render: (_, window) => (window.endSeconds - window.startSeconds).toFixed(2) },
          ]}
          locale={{ emptyText: "该范围内无波束覆盖" }}
        />
      </>}
      <Space><Button size="small" onClick={() => downloadTextFile(timestampedFileName("spacedrone-revisit-analysis", "csv"), revisitAnalysisToCsv(result), "text/csv")}>导出分析 CSV</Button></Space>
    </>}
  </section>;
}

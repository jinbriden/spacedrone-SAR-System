import { Alert, Button, Collapse, Descriptions, Form, InputNumber, Space, Switch, Table, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { downloadTextFile, timestampedFileName } from "../io/browserFiles";
import { taskPlanToCsv } from "../io/taskPlanExport";
import { createDefaultMissionTask, useSimulationStore } from "../stores/simulationStore";
import { runTaskPlanningWorker } from "../workers/taskPlanningWorkerClient";
import type { TaskPlanningResult } from "../workers/taskPlanning";

const { Text, Title } = Typography;
const STATUS = {
  completed: { color: "success", text: "已完成" }, partial: { color: "warning", text: "部分完成" }, unscheduled: { color: "error", text: "未安排" },
} as const;
const REASON: Record<string, string> = { "no-opportunity": "无可执行窗口", "insufficient-opportunity": "机会总时长不足", "resource-conflict": "卫星资源冲突或缺少连续窗口" };

export function TaskPlanningPanel() {
  const orbit = useSimulationStore((state) => state.orbit);
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const companions = useSimulationStore((state) => state.companionSatellites);
  const targets = useSimulationStore((state) => state.targets);
  const tasks = useSimulationStore((state) => state.taskRequirements);
  const terrain = useSimulationStore((state) => state.terrain);
  const settings = useSimulationStore((state) => state.missionSettings);
  const updateTask = useSimulationStore((state) => state.updateTaskRequirement);
  const updateSettings = useSimulationStore((state) => state.updateMissionSettings);
  const [result, setResult] = useState<TaskPlanningResult>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const configured = targets.map((target) => tasks[target.id] ?? createDefaultMissionTask(target.id));
  const enabled = configured.filter((task) => task.enabled);
  const satelliteCount = 1 + companions.filter((satellite) => satellite.enabled).length;
  const coarseCount = Math.ceil((settings.taskPlanEndSeconds - settings.taskPlanStartSeconds) / settings.taskPlanSampleStepSeconds) + 1;
  const workload = coarseCount * enabled.length * satelliteCount;
  const invalidRange = settings.taskPlanEndSeconds <= settings.taskPlanStartSeconds;
  const invalidTolerance = settings.taskPlanTransitionToleranceSeconds > settings.taskPlanSampleStepSeconds;
  const invalidTasks = enabled.some((task) => task.latestEndSeconds <= task.earliestStartSeconds || task.minimumSegmentSeconds > task.requiredDurationSeconds);

  useEffect(() => { setResult(undefined); setError(undefined); }, [orbit, attitude, antenna, companions, targets, tasks, terrain, settings.taskPlanStartSeconds, settings.taskPlanEndSeconds, settings.taskPlanSampleStepSeconds, settings.taskPlanTransitionToleranceSeconds]);
  const satelliteRows = useMemo(() => result ? Object.entries(result.satelliteNames).map(([id, name]) => ({ id, name, utilization: result.schedule.satelliteUtilization[id] ?? 0 })) : [], [result]);
  const run = async () => {
    setRunning(true); setError(undefined);
    try {
      setResult(await runTaskPlanningWorker({
        orbit, attitude, antenna, companionSatellites: companions, targets, tasks: enabled, terrain,
        startSeconds: settings.taskPlanStartSeconds, endSeconds: settings.taskPlanEndSeconds,
        sampleStepSeconds: settings.taskPlanSampleStepSeconds, transitionToleranceSeconds: settings.taskPlanTransitionToleranceSeconds,
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "任务规划失败。"); }
    finally { setRunning(false); }
  };
  const planDuration = result ? result.endSeconds - result.startSeconds : 1;

  return <section className="panel-section task-planning-panel">
    <Title level={4}>目标区域任务规划</Title>
    <Text type="secondary">机会窗口使用目标跟踪指向和真实覆盖相交；高优先级、早截止任务先分配。</Text>
    <Alert type="info" showIcon title="调度约束" description="同一卫星同一时刻只执行一个任务，同一任务不会被多星重复同时累计；这是确定性的优先级贪心计划，不保证全局最优。" />
    <Alert type="warning" showIcon title="机会窗口采样约束" description="短于粗采样步长且未命中采样时刻的可执行窗口可能漏检；边界容差只约束已发现窗口。窄波束或短任务请减小步长。" />
    <Form layout="vertical" size="small" className="parameter-form">
      <Form.Item label="规划起始时间 (s)"><InputNumber min={0} value={settings.taskPlanStartSeconds} onChange={(value) => value !== null && updateSettings({ taskPlanStartSeconds: value })} /></Form.Item>
      <Form.Item label="规划结束时间 (s)" validateStatus={invalidRange ? "error" : undefined}><InputNumber min={0} value={settings.taskPlanEndSeconds} onChange={(value) => value !== null && updateSettings({ taskPlanEndSeconds: value })} /></Form.Item>
      <Form.Item label="机会粗采样步长 (s)"><InputNumber min={0.01} value={settings.taskPlanSampleStepSeconds} onChange={(value) => value !== null && updateSettings({ taskPlanSampleStepSeconds: value })} /></Form.Item>
      <Form.Item label="窗口边界容差 (s)" validateStatus={invalidTolerance ? "error" : undefined}><InputNumber min={0.001} value={settings.taskPlanTransitionToleranceSeconds} onChange={(value) => value !== null && updateSettings({ taskPlanTransitionToleranceSeconds: value })} /></Form.Item>
    </Form>
    <Text type={workload > 100_000 ? "danger" : "secondary"}>工作量：{satelliteCount} 星 × {enabled.length} 任务 × {coarseCount} 时刻 = {workload.toLocaleString()}</Text>
    <Collapse size="small" items={targets.map((target) => {
      const task = tasks[target.id] ?? createDefaultMissionTask(target.id);
      return { key: target.id, label: `${target.name}${task.enabled ? ` · P${task.priority}` : "（未启用）"}`, children: <Form layout="vertical" size="small" className="parameter-form">
        <Form.Item label="纳入规划"><Switch checked={task.enabled} onChange={(value) => updateTask(target.id, { enabled: value })} /></Form.Item>
        <Form.Item label="优先级 (1～10)"><InputNumber min={1} max={10} precision={0} value={task.priority} onChange={(value) => value !== null && updateTask(target.id, { priority: value })} /></Form.Item>
        <Form.Item label="所需观测时长 (s)"><InputNumber min={0.001} value={task.requiredDurationSeconds} onChange={(value) => value !== null && updateTask(target.id, { requiredDurationSeconds: value })} /></Form.Item>
        <Form.Item label="最早开始 (s)"><InputNumber min={0} value={task.earliestStartSeconds} onChange={(value) => value !== null && updateTask(target.id, { earliestStartSeconds: value })} /></Form.Item>
        <Form.Item label="最晚结束 (s)"><InputNumber min={0} value={task.latestEndSeconds} onChange={(value) => value !== null && updateTask(target.id, { latestEndSeconds: value })} /></Form.Item>
        <Form.Item label="最小连续段 (s)"><InputNumber min={0.001} value={task.minimumSegmentSeconds} onChange={(value) => value !== null && updateTask(target.id, { minimumSegmentSeconds: value })} /></Form.Item>
        <Form.Item label="允许跨窗口拆分"><Switch checked={task.allowSplit} onChange={(value) => updateTask(target.id, { allowSplit: value })} /></Form.Item>
      </Form> };
    })} />
    <Button type="primary" block loading={running} disabled={enabled.length === 0 || invalidRange || invalidTolerance || invalidTasks || workload > 100_000} onClick={() => void run()}>生成任务计划</Button>
    {error && <Alert type="error" showIcon title="规划失败" description={error} />}
    {result && <>
      <Descriptions size="small" column={1} colon={false}>
        <Descriptions.Item label="UTC 范围">{result.startUtc} ～ {result.endUtc}</Descriptions.Item>
        <Descriptions.Item label="机会窗口 / 已排段">{result.opportunities.length} / {result.schedule.segments.length}</Descriptions.Item>
      </Descriptions>
      <Table size="small" pagination={false} rowKey="taskId" dataSource={result.schedule.tasks} columns={[
        { title: "目标", render: (_, row) => result.targetNames[row.targetId] },
        { title: "优先级", dataIndex: "priority" },
        { title: "状态", render: (_, row) => <><Tag color={STATUS[row.status].color}>{STATUS[row.status].text}</Tag>{row.reason ? REASON[row.reason] : ""}</> },
        { title: "已排/所需 (s)", render: (_, row) => `${row.scheduledDurationSeconds.toFixed(1)} / ${row.requiredDurationSeconds.toFixed(1)}` },
      ]} />
      <Text strong>按卫星计划时间轴</Text>
      <div className="task-gantt">
        {satelliteRows.map((satellite) => <div className="task-gantt-row" key={satellite.id}>
          <span className="task-gantt-label">{satellite.name}<small>{(satellite.utilization * 100).toFixed(2)}%</small></span>
          <div className="task-gantt-track">{result.schedule.segments.filter((segment) => segment.satelliteId === satellite.id).map((segment) => <div
            className="task-gantt-segment" key={`${segment.taskId}-${segment.startSeconds}`}
            title={`${result.targetNames[segment.targetId]}: ${segment.startSeconds.toFixed(1)}～${segment.endSeconds.toFixed(1)} s`}
            style={{ left: `${(segment.startSeconds - result.startSeconds) / planDuration * 100}%`, width: `${Math.max(0.2, segment.durationSeconds / planDuration * 100)}%`, opacity: 0.45 + segment.priority * 0.05 }}
          />)}</div>
        </div>)}
      </div>
      <Table size="small" rowKey={(row) => `${row.satelliteId}-${row.taskId}-${row.startSeconds}`} pagination={{ pageSize: 6, size: "small" }} dataSource={result.schedule.segments} columns={[
        { title: "卫星", render: (_, row) => result.satelliteNames[row.satelliteId] },
        { title: "目标", render: (_, row) => result.targetNames[row.targetId] },
        { title: "开始", render: (_, row) => row.startSeconds.toFixed(2) },
        { title: "结束", render: (_, row) => row.endSeconds.toFixed(2) },
        { title: "时长", render: (_, row) => row.durationSeconds.toFixed(2) },
      ]} />
      <Space><Button size="small" onClick={() => downloadTextFile(timestampedFileName("spacedrone-task-plan", "csv"), taskPlanToCsv(result), "text/csv")}>导出任务计划 CSV</Button></Space>
    </>}
  </section>;
}

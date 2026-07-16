export interface PlanningTask {
  taskId: string;
  targetId: string;
  priority: number;
  requiredDurationSeconds: number;
  earliestStartSeconds: number;
  latestEndSeconds: number;
  minimumSegmentSeconds: number;
  allowSplit: boolean;
}

export interface TaskOpportunityWindow {
  taskId: string;
  satelliteId: string;
  startSeconds: number;
  endSeconds: number;
}

export interface ScheduledTaskSegment {
  taskId: string;
  targetId: string;
  satelliteId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  priority: number;
}

export interface PlannedTaskStatus {
  taskId: string;
  targetId: string;
  priority: number;
  requiredDurationSeconds: number;
  scheduledDurationSeconds: number;
  remainingDurationSeconds: number;
  status: "completed" | "partial" | "unscheduled";
  reason?: "no-opportunity" | "insufficient-opportunity" | "resource-conflict";
  segments: ScheduledTaskSegment[];
}

export interface TaskScheduleResult {
  tasks: PlannedTaskStatus[];
  segments: ScheduledTaskSegment[];
  satelliteUtilization: Record<string, number>;
}

interface Interval { startSeconds: number; endSeconds: number }

function subtractBlocked(source: Interval, blocked: readonly Interval[]): Interval[] {
  let free: Interval[] = [source];
  for (const blocker of blocked) {
    const next: Interval[] = [];
    for (const interval of free) {
      if (blocker.endSeconds <= interval.startSeconds || blocker.startSeconds >= interval.endSeconds) next.push(interval);
      else {
        if (blocker.startSeconds > interval.startSeconds) next.push({ startSeconds: interval.startSeconds, endSeconds: blocker.startSeconds });
        if (blocker.endSeconds < interval.endSeconds) next.push({ startSeconds: blocker.endSeconds, endSeconds: interval.endSeconds });
      }
    }
    free = next;
  }
  return free;
}

function validateTask(task: PlanningTask): void {
  if (!task.taskId || !task.targetId) throw new RangeError("规划任务 ID 和目标 ID 不能为空。");
  if (!Number.isInteger(task.priority) || task.priority < 1 || task.priority > 10) throw new RangeError(`任务 ${task.taskId} 优先级必须是 1～10 的整数。`);
  if (!Number.isFinite(task.requiredDurationSeconds) || task.requiredDurationSeconds <= 0) throw new RangeError(`任务 ${task.taskId} 所需观测时长必须大于 0。`);
  if (!Number.isFinite(task.earliestStartSeconds) || !Number.isFinite(task.latestEndSeconds) || task.latestEndSeconds <= task.earliestStartSeconds) throw new RangeError(`任务 ${task.taskId} 的最晚结束时间必须晚于最早开始时间。`);
  if (!Number.isFinite(task.minimumSegmentSeconds) || task.minimumSegmentSeconds <= 0 || task.minimumSegmentSeconds > task.requiredDurationSeconds) throw new RangeError(`任务 ${task.taskId} 最小连续段必须大于 0 且不超过所需时长。`);
}

/** Priority-first deterministic scheduler with exclusive satellite resources and no duplicate simultaneous task segments. */
export function scheduleObservationTasks(
  tasks: readonly PlanningTask[],
  opportunities: readonly TaskOpportunityWindow[],
  planStartSeconds: number,
  planEndSeconds: number,
): TaskScheduleResult {
  if (!Number.isFinite(planStartSeconds) || !Number.isFinite(planEndSeconds) || planEndSeconds <= planStartSeconds) {
    throw new RangeError("任务规划结束时间必须晚于起始时间。");
  }
  const taskIds = new Set<string>();
  for (const task of tasks) {
    validateTask(task);
    if (taskIds.has(task.taskId)) throw new RangeError(`任务 ID 重复：${task.taskId}。`);
    taskIds.add(task.taskId);
  }
  for (const opportunity of opportunities) {
    if (!taskIds.has(opportunity.taskId)) throw new RangeError(`机会窗口引用未知任务：${opportunity.taskId}。`);
    if (!opportunity.satelliteId || !Number.isFinite(opportunity.startSeconds) || !Number.isFinite(opportunity.endSeconds) || opportunity.endSeconds <= opportunity.startSeconds) {
      throw new RangeError("任务机会窗口的卫星或起止时间无效。");
    }
  }

  const satelliteBookings = new Map<string, Interval[]>();
  const taskBookings = new Map<string, Interval[]>();
  const statuses: PlannedTaskStatus[] = [];
  const allSegments: ScheduledTaskSegment[] = [];
  const orderedTasks = [...tasks].sort((a, b) => b.priority - a.priority || a.latestEndSeconds - b.latestEndSeconds || a.taskId.localeCompare(b.taskId));

  for (const task of orderedTasks) {
    const rawWindows = opportunities.filter((window) => window.taskId === task.taskId).map((window) => ({
      satelliteId: window.satelliteId,
      startSeconds: Math.max(planStartSeconds, task.earliestStartSeconds, window.startSeconds),
      endSeconds: Math.min(planEndSeconds, task.latestEndSeconds, window.endSeconds),
    })).filter((window) => window.endSeconds - window.startSeconds >= task.minimumSegmentSeconds);
    const rawOpportunityDuration = rawWindows.reduce((sum, window) => sum + window.endSeconds - window.startSeconds, 0);
    const candidates = rawWindows.flatMap((window) => {
      const blocked = [
        ...(satelliteBookings.get(window.satelliteId) ?? []),
        ...(taskBookings.get(task.taskId) ?? []),
      ].sort((a, b) => a.startSeconds - b.startSeconds);
      return subtractBlocked(window, blocked).filter((interval) => interval.endSeconds - interval.startSeconds >= task.minimumSegmentSeconds).map((interval) => ({ ...interval, satelliteId: window.satelliteId }));
    }).sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds || a.satelliteId.localeCompare(b.satelliteId));

    const selected: ScheduledTaskSegment[] = [];
    let remaining = task.requiredDurationSeconds;
    if (!task.allowSplit) {
      const candidate = candidates.find((item) => item.endSeconds - item.startSeconds >= task.requiredDurationSeconds);
      if (candidate) {
        selected.push({ taskId: task.taskId, targetId: task.targetId, satelliteId: candidate.satelliteId, startSeconds: candidate.startSeconds, endSeconds: candidate.startSeconds + task.requiredDurationSeconds, durationSeconds: task.requiredDurationSeconds, priority: task.priority });
        remaining = 0;
      }
    } else {
      for (const baseCandidate of candidates) {
        if (remaining <= 1e-9) break;
        const localFree = subtractBlocked(baseCandidate, selected.map((segment) => ({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds })));
        for (const candidate of localFree) {
          if (remaining <= 1e-9) break;
          const available = candidate.endSeconds - candidate.startSeconds;
          if (available < task.minimumSegmentSeconds) continue;
          const duration = remaining <= available ? Math.max(remaining, task.minimumSegmentSeconds) : available;
          if (duration > available + 1e-9) continue;
          selected.push({ taskId: task.taskId, targetId: task.targetId, satelliteId: baseCandidate.satelliteId, startSeconds: candidate.startSeconds, endSeconds: candidate.startSeconds + duration, durationSeconds: duration, priority: task.priority });
          remaining -= duration;
        }
      }
    }
    for (const segment of selected) {
      const interval = { startSeconds: segment.startSeconds, endSeconds: segment.endSeconds };
      satelliteBookings.set(segment.satelliteId, [...(satelliteBookings.get(segment.satelliteId) ?? []), interval].sort((a, b) => a.startSeconds - b.startSeconds));
      taskBookings.set(task.taskId, [...(taskBookings.get(task.taskId) ?? []), interval].sort((a, b) => a.startSeconds - b.startSeconds));
      allSegments.push(segment);
    }
    const scheduledDurationSeconds = selected.reduce((sum, segment) => sum + segment.durationSeconds, 0);
    const completed = scheduledDurationSeconds + 1e-9 >= task.requiredDurationSeconds;
    const reason = completed ? undefined
      : rawWindows.length === 0 ? "no-opportunity"
        : rawOpportunityDuration + 1e-9 < task.requiredDurationSeconds ? "insufficient-opportunity"
          : "resource-conflict";
    statuses.push({
      taskId: task.taskId, targetId: task.targetId, priority: task.priority,
      requiredDurationSeconds: task.requiredDurationSeconds,
      scheduledDurationSeconds,
      remainingDurationSeconds: Math.max(0, task.requiredDurationSeconds - scheduledDurationSeconds),
      status: completed ? "completed" : scheduledDurationSeconds > 0 ? "partial" : "unscheduled",
      reason, segments: selected,
    });
  }
  allSegments.sort((a, b) => a.startSeconds - b.startSeconds || a.satelliteId.localeCompare(b.satelliteId));
  const satelliteIds = new Set(opportunities.map((window) => window.satelliteId));
  const planDuration = planEndSeconds - planStartSeconds;
  return {
    tasks: statuses,
    segments: allSegments,
    satelliteUtilization: Object.fromEntries([...satelliteIds].map((satelliteId) => [
      satelliteId,
      allSegments.filter((segment) => segment.satelliteId === satelliteId).reduce((sum, segment) => sum + segment.durationSeconds, 0) / planDuration,
    ])),
  };
}

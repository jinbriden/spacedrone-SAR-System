export interface AccessWindow {
  startSeconds: number;
  endSeconds: number;
  clippedAtStart: boolean;
  clippedAtEnd: boolean;
}

export interface AccessStatistics {
  accessCount: number;
  firstAccessStartSeconds?: number;
  lastAccessEndSeconds?: number;
  totalAccessDurationSeconds: number;
  coverageFraction: number;
  meanAccessDurationSeconds?: number;
  maxAccessDurationSeconds?: number;
  revisitIntervalsSeconds: number[];
  meanRevisitSeconds?: number;
  minRevisitSeconds?: number;
  maxRevisitSeconds?: number;
  maxUncoveredGapSeconds: number;
}

/** Summarizes ordered, non-overlapping access windows inside one analysis range. */
export function summarizeAccessWindows(
  windows: readonly AccessWindow[],
  analysisStartSeconds: number,
  analysisEndSeconds: number,
): AccessStatistics {
  if (!Number.isFinite(analysisStartSeconds) || !Number.isFinite(analysisEndSeconds) || analysisEndSeconds <= analysisStartSeconds) {
    throw new RangeError("访问统计结束时间必须晚于起始时间，且二者均为有限秒数。");
  }
  let previousEnd = analysisStartSeconds;
  for (const [index, window] of windows.entries()) {
    if (!Number.isFinite(window.startSeconds) || !Number.isFinite(window.endSeconds) || window.endSeconds < window.startSeconds) {
      throw new RangeError(`访问窗口 ${index + 1} 的起止时间无效。`);
    }
    if (window.startSeconds < analysisStartSeconds || window.endSeconds > analysisEndSeconds) {
      throw new RangeError(`访问窗口 ${index + 1} 超出分析时间范围。`);
    }
    if (window.startSeconds < previousEnd) throw new RangeError("访问窗口必须按时间排序且不能重叠。");
    previousEnd = window.endSeconds;
  }

  const durations = windows.map((window) => window.endSeconds - window.startSeconds);
  const totalAccessDurationSeconds = durations.reduce((sum, duration) => sum + duration, 0);
  const revisitIntervalsSeconds = windows.slice(1).map((window, index) =>
    window.startSeconds - windows[index].endSeconds,
  );
  const uncoveredGaps = windows.length === 0
    ? [analysisEndSeconds - analysisStartSeconds]
    : [
        windows[0].startSeconds - analysisStartSeconds,
        ...revisitIntervalsSeconds,
        analysisEndSeconds - windows[windows.length - 1].endSeconds,
      ];
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    accessCount: windows.length,
    firstAccessStartSeconds: windows[0]?.startSeconds,
    lastAccessEndSeconds: windows.at(-1)?.endSeconds,
    totalAccessDurationSeconds,
    coverageFraction: totalAccessDurationSeconds / (analysisEndSeconds - analysisStartSeconds),
    meanAccessDurationSeconds: durations.length > 0 ? mean(durations) : undefined,
    maxAccessDurationSeconds: durations.length > 0 ? Math.max(...durations) : undefined,
    revisitIntervalsSeconds,
    meanRevisitSeconds: revisitIntervalsSeconds.length > 0 ? mean(revisitIntervalsSeconds) : undefined,
    minRevisitSeconds: revisitIntervalsSeconds.length > 0 ? Math.min(...revisitIntervalsSeconds) : undefined,
    maxRevisitSeconds: revisitIntervalsSeconds.length > 0 ? Math.max(...revisitIntervalsSeconds) : undefined,
    maxUncoveredGapSeconds: Math.max(...uncoveredGaps),
  };
}

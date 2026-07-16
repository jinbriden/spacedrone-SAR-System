export interface TargetPassState {
  firstEntrySeconds?: number;
  lastExitSeconds?: number;
  currentEntrySeconds?: number;
  cumulativeIlluminationSeconds: number;
  lastSampleSeconds?: number;
  wasInside: boolean;
}

export function createEmptyTargetPassState(): TargetPassState {
  return { cumulativeIlluminationSeconds: 0, wasInside: false };
}

/** Updates a pass accumulator at monotonically increasing fixed-time samples. */
export function updateTargetPassState(
  previous: TargetPassState | undefined,
  sampleSeconds: number,
  insideFootprint: boolean,
): TargetPassState {
  if (!Number.isFinite(sampleSeconds) || sampleSeconds < 0) {
    throw new RangeError("目标统计采样时间必须是非负有限数值。");
  }
  if (previous?.lastSampleSeconds !== undefined && sampleSeconds < previous.lastSampleSeconds) {
    previous = undefined;
  }
  const state = previous ?? createEmptyTargetPassState();
  const deltaSeconds =
    state.lastSampleSeconds === undefined ? 0 : sampleSeconds - state.lastSampleSeconds;
  const cumulativeIlluminationSeconds =
    state.cumulativeIlluminationSeconds + (state.wasInside ? deltaSeconds : 0);
  const entering = insideFootprint && !state.wasInside;
  const exiting = !insideFootprint && state.wasInside;
  return {
    firstEntrySeconds: state.firstEntrySeconds ?? (entering ? sampleSeconds : undefined),
    lastExitSeconds: exiting ? sampleSeconds : state.lastExitSeconds,
    currentEntrySeconds: entering
      ? sampleSeconds
      : exiting
        ? undefined
        : state.currentEntrySeconds,
    cumulativeIlluminationSeconds,
    lastSampleSeconds: sampleSeconds,
    wasInside: insideFootprint,
  };
}

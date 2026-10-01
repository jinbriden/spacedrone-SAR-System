export const DEFAULT_SWATH_MIN_STEP_M = 8_000;
export const DEFAULT_SWATH_MAX_SAMPLES = 360;

export interface CoverageSwathState {
  leftEcefM: Array<[number, number, number]>;
  rightEcefM: Array<[number, number, number]>;
  lastCenterEcefM?: readonly number[];
  lastElapsedSeconds: number;
}

export function createCoverageSwathState(): CoverageSwathState {
  return {
    leftEcefM: [],
    rightEcefM: [],
    lastElapsedSeconds: 0,
  };
}

export function resetCoverageSwath(state: CoverageSwathState): void {
  state.leftEcefM = [];
  state.rightEcefM = [];
  state.lastCenterEcefM = undefined;
  state.lastElapsedSeconds = 0;
}

export function distanceEcefM(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function footprintSideEdges(
  verticesEcefM: ReadonlyArray<readonly number[]>,
  crossTrackEcef: readonly number[],
): { left: [number, number, number]; right: [number, number, number] } | undefined {
  if (verticesEcefM.length < 3) return undefined;
  let minDot = Infinity;
  let maxDot = -Infinity;
  let left: [number, number, number] | undefined;
  let right: [number, number, number] | undefined;
  for (const vertex of verticesEcefM) {
    const dot = vertex[0] * crossTrackEcef[0]
      + vertex[1] * crossTrackEcef[1]
      + vertex[2] * crossTrackEcef[2];
    if (dot < minDot) {
      minDot = dot;
      left = [vertex[0], vertex[1], vertex[2]];
    }
    if (dot > maxDot) {
      maxDot = dot;
      right = [vertex[0], vertex[1], vertex[2]];
    }
  }
  if (!left || !right) return undefined;
  return { left, right };
}

export function syncCoverageSwath(
  state: CoverageSwathState,
  input: {
    elapsedSeconds: number;
    centerEcefM: readonly number[];
    verticesEcefM: ReadonlyArray<readonly number[]>;
    crossTrackEcef: readonly number[];
    minStepM?: number;
    maxSamples?: number;
  },
): void {
  if (input.elapsedSeconds + 1e-9 < state.lastElapsedSeconds) {
    resetCoverageSwath(state);
  }
  state.lastElapsedSeconds = input.elapsedSeconds;
  const edges = footprintSideEdges(input.verticesEcefM, input.crossTrackEcef);
  if (!edges) return;

  const minStepM = input.minStepM ?? DEFAULT_SWATH_MIN_STEP_M;
  const maxSamples = input.maxSamples ?? DEFAULT_SWATH_MAX_SAMPLES;
  if (state.leftEcefM.length === 0) {
    state.leftEcefM.push(edges.left, [...edges.left]);
    state.rightEcefM.push(edges.right, [...edges.right]);
    state.lastCenterEcefM = [...input.centerEcefM];
    return;
  }

  const movedM = state.lastCenterEcefM
    ? distanceEcefM(state.lastCenterEcefM, input.centerEcefM)
    : Number.POSITIVE_INFINITY;
  if (movedM >= minStepM) {
    state.leftEcefM.push(edges.left);
    state.rightEcefM.push(edges.right);
    state.lastCenterEcefM = [...input.centerEcefM];
    if (state.leftEcefM.length > maxSamples) {
      const drop = state.leftEcefM.length - maxSamples;
      state.leftEcefM.splice(0, drop);
      state.rightEcefM.splice(0, drop);
    }
    return;
  }

  const nose = state.leftEcefM.length - 1;
  state.leftEcefM[nose] = edges.left;
  state.rightEcefM[nose] = edges.right;
}

export function coverageSwathRing(state: CoverageSwathState): Array<[number, number, number]> {
  if (state.leftEcefM.length < 2 || state.rightEcefM.length < 2) return [];
  return [...state.leftEcefM, ...[...state.rightEcefM].reverse()];
}

import { describe, expect, it } from "vitest";
import {
  coverageSwathRing,
  createCoverageSwathState,
  footprintSideEdges,
  syncCoverageSwath,
} from "./coverageSwath";

describe("coverage swath", () => {
  it("按横航迹方向取覆盖区左右沿", () => {
    const edges = footprintSideEdges(
      [
        [0, -10, 0],
        [4, 0, 0],
        [0, 8, 0],
        [-3, 0, 0],
      ],
      [0, 1, 0],
    );
    expect(edges).toEqual({
      left: [0, -10, 0],
      right: [0, 8, 0],
    });
  });

  it("时间回退时清空轨迹，前进时鼻端跟随并按步长落点", () => {
    const state = createCoverageSwathState();
    syncCoverageSwath(state, {
      elapsedSeconds: 10,
      centerEcefM: [0, 0, 0],
      verticesEcefM: [
        [0, -1, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      crossTrackEcef: [0, 1, 0],
      minStepM: 5,
    });
    expect(state.leftEcefM).toHaveLength(2);

    syncCoverageSwath(state, {
      elapsedSeconds: 11,
      centerEcefM: [1, 0, 0],
      verticesEcefM: [
        [1, -1, 0],
        [2, 0, 0],
        [1, 1, 0],
      ],
      crossTrackEcef: [0, 1, 0],
      minStepM: 5,
    });
    expect(state.leftEcefM).toHaveLength(2);
    expect(state.leftEcefM[1]).toEqual([1, -1, 0]);

    syncCoverageSwath(state, {
      elapsedSeconds: 12,
      centerEcefM: [6, 0, 0],
      verticesEcefM: [
        [6, -1, 0],
        [7, 0, 0],
        [6, 1, 0],
      ],
      crossTrackEcef: [0, 1, 0],
      minStepM: 5,
    });
    expect(state.leftEcefM).toHaveLength(3);
    expect(coverageSwathRing(state)).toHaveLength(6);

    syncCoverageSwath(state, {
      elapsedSeconds: 1,
      centerEcefM: [0, 0, 0],
      verticesEcefM: [
        [0, -1, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      crossTrackEcef: [0, 1, 0],
      minStepM: 5,
    });
    expect(state.leftEcefM).toHaveLength(2);
    expect(state.lastElapsedSeconds).toBe(1);
  });
});

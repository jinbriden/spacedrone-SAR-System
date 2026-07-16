import { describe, expect, it } from "vitest";
import { updateTargetPassState } from "./passTracking";

describe("target pass tracking", () => {
  it("记录首次进入、离开和累计照射时间", () => {
    let state = updateTargetPassState(undefined, 0, false);
    state = updateTargetPassState(state, 1, true);
    state = updateTargetPassState(state, 2, true);
    state = updateTargetPassState(state, 3, true);
    state = updateTargetPassState(state, 4, false);
    expect(state.firstEntrySeconds).toBe(1);
    expect(state.lastExitSeconds).toBe(4);
    expect(state.cumulativeIlluminationSeconds).toBe(3);
    expect(state.wasInside).toBe(false);
  });

  it("时间回退时重新开始统计", () => {
    let state = updateTargetPassState(undefined, 10, true);
    state = updateTargetPassState(state, 11, true);
    state = updateTargetPassState(state, 0, false);
    expect(state.cumulativeIlluminationSeconds).toBe(0);
    expect(state.firstEntrySeconds).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { SimulationClock } from "./simulationClock";

describe("SimulationClock", () => {
  it("按真实时间增量和倍率推进，而不是按渲染帧计数", () => {
    const clock = new SimulationClock({
      startUtc: new Date("2026-07-15T00:00:00Z"),
      playbackRate: 100,
      playing: true,
    });
    clock.advance(0.25);
    clock.advance(0.75);
    expect(clock.elapsedSeconds).toBe(100);
    expect(clock.currentUtc.toISOString()).toBe("2026-07-15T00:01:40.000Z");
  });

  it("暂停时不推进，单步与重置仍可用", () => {
    const clock = new SimulationClock({
      startUtc: new Date("2026-07-15T00:00:00Z"),
    });
    clock.advance(1);
    expect(clock.elapsedSeconds).toBe(0);
    clock.step(1);
    expect(clock.elapsedSeconds).toBe(1);
    clock.reset();
    expect(clock.elapsedSeconds).toBe(0);
  });
});

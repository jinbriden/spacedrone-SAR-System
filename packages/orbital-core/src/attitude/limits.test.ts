import { describe, expect, it } from "vitest";
import { validateAttitudeLimits } from "./limits";

const limits = { maxRollRad: 1, maxPitchRad: 1, maxYawRad: Math.PI, maxAngularRateRadS: 0.2, maxAngularAccelerationRadS2: 0.1 };

describe("attitude limits", () => {
  it("uses shortest wrapped Euler deltas for angular-rate validation", () => {
    const diagnostics = validateAttitudeLimits(
      { rollRad: 0, pitchRad: 0, yawRad: 0 },
      [{ timeSeconds: 0, rollRad: 0, pitchRad: 0, yawRad: 170 * Math.PI / 180 }, { timeSeconds: 10, rollRad: 0, pitchRad: 0, yawRad: -170 * Math.PI / 180 }],
      limits,
    );
    expect(diagnostics.maxObservedAngularRateRadS).toBeCloseTo(2 * Math.PI / 180, 12);
  });

  it("rejects angle, vector rate, and turn-point acceleration violations", () => {
    expect(() => validateAttitudeLimits({ rollRad: 1.1, pitchRad: 0, yawRad: 0 }, [], limits)).toThrow(/滚转角/);
    expect(() => validateAttitudeLimits({ rollRad: 0, pitchRad: 0, yawRad: 0 }, [{ timeSeconds: 0, rollRad: 0, pitchRad: 0, yawRad: 0 }, { timeSeconds: 1, rollRad: 0.3, pitchRad: 0.3, yawRad: 0 }], limits)).toThrow(/角速度/);
    expect(() => validateAttitudeLimits({ rollRad: 0, pitchRad: 0, yawRad: 0 }, [{ timeSeconds: 0, rollRad: 0, pitchRad: 0, yawRad: 0 }, { timeSeconds: 2, rollRad: 0.3, pitchRad: 0, yawRad: 0 }, { timeSeconds: 4, rollRad: 0, pitchRad: 0, yawRad: 0 }], limits)).toThrow(/角加速度/);
  });
});

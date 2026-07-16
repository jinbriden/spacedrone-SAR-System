import type { Vector3 } from "../types";

export interface OrbitPropagator {
  readonly periodSeconds: number;
  propagate(epochSeconds: number): {
    positionEciM: Vector3;
    velocityEciMps: Vector3;
  };
}

import { useMemo } from "react";
import { useSimulationStore } from "../stores/simulationStore";
import { computeSceneGeometry } from "../simulation/sceneGeometry";

export function useSceneGeometry() {
  const orbit = useSimulationStore((state) => state.orbit);
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const targets = useSimulationStore((state) => state.targets);
  const terrain = useSimulationStore((state) => state.terrain);
  const elapsedSeconds = useSimulationStore((state) => state.elapsedSeconds);
  return useMemo(
    () => computeSceneGeometry({ orbit, attitude, antenna, targets, terrain, elapsedSeconds }),
    [antenna, attitude, elapsedSeconds, orbit, targets, terrain],
  );
}

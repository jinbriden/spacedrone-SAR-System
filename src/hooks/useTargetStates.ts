import { useMemo } from "react";
import { computeTargetObservations } from "../simulation/targetObservation";
import { useSimulationStore } from "../stores/simulationStore";
import { useSceneGeometry } from "./useSceneGeometry";

export function useTargetStates() {
  const scene = useSceneGeometry();
  const targets = useSimulationStore((state) => state.targets);
  const terrain = useSimulationStore((state) => state.terrain);
  return useMemo(() => computeTargetObservations(scene, targets, terrain), [scene, targets, terrain]);
}

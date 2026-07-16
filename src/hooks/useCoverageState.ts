import { useSceneGeometry } from "./useSceneGeometry";

export function useCoverageState() {
  return useSceneGeometry().coverage;
}

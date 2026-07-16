import { useSceneGeometry } from "./useSceneGeometry";

export function useSatelliteState() {
  return useSceneGeometry().satellite;
}

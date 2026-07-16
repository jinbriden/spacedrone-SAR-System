import { useSceneGeometry } from "./useSceneGeometry";

export function useAttitudeState() {
  return useSceneGeometry().attitude;
}

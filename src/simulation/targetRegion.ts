import {
  sampleCircularTargetRegion,
  sampleRectangularTargetRegion,
  type GeodeticDegreesPoint,
} from "@spacedrone/orbital-core";
import type { GroundTargetConfig } from "../stores/simulationStore";

export function targetRegionBoundary(target: GroundTargetConfig): GeodeticDegreesPoint[] | undefined {
  const center = { longitudeDeg: target.longitudeDeg, latitudeDeg: target.latitudeDeg };
  if (target.targetType === "circle") return sampleCircularTargetRegion(center, target.radiusM, 64);
  if (target.targetType === "rectangle") return sampleRectangularTargetRegion(center, target.widthM, target.heightM);
  if (target.targetType === "polygon") return target.vertices.map((vertex) => ({ ...vertex }));
  return undefined;
}

export const TARGET_TYPE_LABELS: Record<GroundTargetConfig["targetType"], string> = {
  point: "点目标",
  circle: "圆形区域",
  rectangle: "矩形区域",
  polygon: "多边形区域",
};

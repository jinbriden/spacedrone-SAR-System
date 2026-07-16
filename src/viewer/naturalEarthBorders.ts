export type BorderCoordinate = readonly [longitudeDeg: number, latitudeDeg: number];

interface GeoJsonGeometry {
  type?: unknown;
  coordinates?: unknown;
}

interface GeoJsonFeature {
  geometry?: GeoJsonGeometry | null;
}

function coordinate(value: unknown): BorderCoordinate | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const longitudeDeg = value[0];
  const latitudeDeg = value[1];
  if (
    typeof longitudeDeg !== "number"
    || typeof latitudeDeg !== "number"
    || !Number.isFinite(longitudeDeg)
    || !Number.isFinite(latitudeDeg)
    || longitudeDeg < -180
    || longitudeDeg > 180
    || latitudeDeg < -90
    || latitudeDeg > 90
  ) return undefined;
  return [longitudeDeg, latitudeDeg];
}

function ring(value: unknown): BorderCoordinate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map(coordinate).filter((item): item is BorderCoordinate => item !== undefined);
  return result.length >= 2 ? result : undefined;
}

export function parseNaturalEarthBorderRings(value: unknown): BorderCoordinate[][] {
  if (!value || typeof value !== "object") throw new Error("国界 GeoJSON 根节点必须是对象。");
  const features = (value as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error("国界 GeoJSON 缺少 features 数组。");
  const rings: BorderCoordinate[][] = [];
  for (const featureValue of features) {
    const geometry = (featureValue as GeoJsonFeature | null)?.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) continue;
    if (geometry.type === "Polygon") {
      for (const ringValue of geometry.coordinates) {
        const parsed = ring(ringValue);
        if (parsed) rings.push(parsed);
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        if (!Array.isArray(polygon)) continue;
        for (const ringValue of polygon) {
          const parsed = ring(ringValue);
          if (parsed) rings.push(parsed);
        }
      }
    }
  }
  if (rings.length === 0) throw new Error("国界 GeoJSON 中没有有效的 Polygon 或 MultiPolygon 边界。");
  return rings;
}

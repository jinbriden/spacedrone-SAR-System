import type { GroundTargetConfig } from "../stores/simulationStore";

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 含有未闭合的双引号。");
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function finite(value: unknown, path: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${path} 必须是有限数值。`);
  return number;
}

type ImportedTarget = Partial<Omit<GroundTargetConfig, "id">> & { id?: string; name: string };

function representativeLongitude(vertices: readonly { longitudeDeg: number }[]): number {
  const sine = vertices.reduce((sum, vertex) => sum + Math.sin(vertex.longitudeDeg * Math.PI / 180), 0);
  const cosine = vertices.reduce((sum, vertex) => sum + Math.cos(vertex.longitudeDeg * Math.PI / 180), 0);
  return Math.atan2(sine, cosine) * 180 / Math.PI;
}

function checkedTarget(target: ImportedTarget, index: number): GroundTargetConfig {
  if (!target.name.trim()) throw new Error(`目标 ${index + 1} 缺少 name。`);
  const targetType = target.targetType ?? "point";
  const vertices = target.vertices ?? [];
  if (!(["point", "circle", "rectangle", "polygon"] as const).includes(targetType)) throw new Error(`目标 ${index + 1} 的 targetType 无效。`);
  const longitudeDeg = target.longitudeDeg ?? (vertices.length > 0 ? representativeLongitude(vertices) : NaN);
  const latitudeDeg = target.latitudeDeg ?? (vertices.length > 0 ? vertices.reduce((sum, vertex) => sum + vertex.latitudeDeg, 0) / vertices.length : NaN);
  if (longitudeDeg < -180 || longitudeDeg > 180 || !Number.isFinite(longitudeDeg)) {
    throw new Error(`目标 ${index + 1} 的 longitudeDeg 必须位于 -180～180 deg。`);
  }
  if (latitudeDeg < -90 || latitudeDeg > 90 || !Number.isFinite(latitudeDeg)) {
    throw new Error(`目标 ${index + 1} 的 latitudeDeg 必须位于 -90～90 deg。`);
  }
  const radiusM = target.radiusM ?? 0;
  const widthM = target.widthM ?? 0;
  const heightM = target.heightM ?? 0;
  if (targetType === "circle" && (!(radiusM > 0) || radiusM > 20_000_000)) throw new Error(`目标 ${index + 1} 的 radiusM 必须大于 0。`);
  if (targetType === "rectangle" && (!(widthM > 0) || !(heightM > 0))) throw new Error(`目标 ${index + 1} 的 widthM 和 heightM 必须大于 0。`);
  if (targetType === "polygon" && vertices.length < 3) throw new Error(`目标 ${index + 1} 的多边形至少需要 3 个顶点。`);
  return {
    id: target.id?.trim() || `imported-target-${index + 1}`,
    name: target.name.trim(),
    targetType,
    longitudeDeg,
    latitudeDeg,
    altitudeM: target.altitudeM ?? 0,
    radiusM,
    widthM,
    heightM,
    vertices,
  };
}

export function parseTargetCsv(text: string): GroundTargetConfig[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV 至少需要表头和一行目标数据。");
  const headers = rows[0].map((header) => header.trim());
  const required = ["name"];
  for (const field of required) {
    if (!headers.includes(field)) {
      throw new Error(`CSV 缺少字段 ${field}。`);
    }
  }
  const indexOf = (name: string) => headers.indexOf(name);
  return rows.slice(1).map((row, index) => {
    const cell = (name: string) => indexOf(name) >= 0 ? row[indexOf(name)] : undefined;
    const optionalNumber = (name: string) => cell(name) !== undefined && cell(name) !== "" ? finite(cell(name), `第 ${index + 2} 行 ${name}`) : undefined;
    const rawType = cell("targetType") || "point";
    if (!(rawType === "point" || rawType === "circle" || rawType === "rectangle" || rawType === "polygon")) throw new Error(`第 ${index + 2} 行 targetType 无效。`);
    let vertices: GroundTargetConfig["vertices"] = [];
    if (cell("vertices")) {
      let rawVertices: unknown;
      try { rawVertices = JSON.parse(cell("vertices")!); } catch { throw new Error(`第 ${index + 2} 行 vertices 必须是 JSON 数组。`); }
      if (!Array.isArray(rawVertices)) throw new Error(`第 ${index + 2} 行 vertices 必须是 JSON 数组。`);
      vertices = rawVertices.map((vertex, vertexIndex) => {
        if (!Array.isArray(vertex) || vertex.length < 2) throw new Error(`第 ${index + 2} 行 vertices[${vertexIndex}] 必须是 [longitudeDeg,latitudeDeg]。`);
        return { longitudeDeg: finite(vertex[0], `vertices[${vertexIndex}][0]`), latitudeDeg: finite(vertex[1], `vertices[${vertexIndex}][1]`) };
      });
    }
    return checkedTarget(
      {
        id: indexOf("id") >= 0 ? row[indexOf("id")] : undefined,
        name: row[indexOf("name")] ?? "",
        targetType: rawType,
        longitudeDeg: optionalNumber("longitudeDeg"),
        latitudeDeg: optionalNumber("latitudeDeg"),
        altitudeM: optionalNumber("altitudeM") ?? 0,
        radiusM: optionalNumber("radiusM"),
        widthM: optionalNumber("widthM"),
        heightM: optionalNumber("heightM"),
        vertices,
      },
      index,
    );
  });
}

export function parseTargetGeoJson(text: string): GroundTargetConfig[] {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("GeoJSON 不是有效 JSON。");
  }
  if (typeof root !== "object" || root === null || (root as { type?: unknown }).type !== "FeatureCollection") {
    throw new Error("GeoJSON 根对象必须是 FeatureCollection。");
  }
  const features = (root as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error("GeoJSON 缺少 features 数组。");
  const targets: GroundTargetConfig[] = [];
  for (const [index, rawFeature] of features.entries()) {
    if (typeof rawFeature !== "object" || rawFeature === null) continue;
    const feature = rawFeature as {
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: Record<string, unknown> | null;
      id?: unknown;
    };
    const geometry = feature.geometry;
    const coordinates = geometry?.coordinates;
    const properties = feature.properties ?? {};
    const common = { id: typeof feature.id === "string" ? feature.id : undefined, name: typeof properties.name === "string" ? properties.name : `导入目标 ${targets.length + 1}` };
    if (geometry?.type === "Point") {
      if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error(`GeoJSON 第 ${index + 1} 个 Point 缺少坐标。`);
      const radiusM = typeof properties.radiusM === "number" ? finite(properties.radiusM, `GeoJSON Point ${index + 1} radiusM`) : 0;
      targets.push(checkedTarget(
        {
          ...common,
          targetType: radiusM > 0 ? "circle" : "point",
          longitudeDeg: finite(coordinates[0], `GeoJSON Point ${index + 1} 经度`),
          latitudeDeg: finite(coordinates[1], `GeoJSON Point ${index + 1} 纬度`),
          altitudeM: coordinates.length >= 3 ? finite(coordinates[2], `GeoJSON Point ${index + 1} 高度`) : 0,
          radiusM,
        },
        targets.length,
      ));
    } else if (geometry?.type === "Polygon") {
      if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) throw new Error(`GeoJSON 第 ${index + 1} 个 Polygon 缺少外环。`);
      const ring = coordinates[0] as unknown[];
      const vertices = ring.map((coordinate, vertexIndex) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error(`GeoJSON Polygon ${index + 1} 顶点 ${vertexIndex + 1} 无效。`);
        return { longitudeDeg: finite(coordinate[0], `Polygon 经度`), latitudeDeg: finite(coordinate[1], `Polygon 纬度`) };
      });
      if (vertices.length > 1 && vertices[0].longitudeDeg === vertices.at(-1)!.longitudeDeg && vertices[0].latitudeDeg === vertices.at(-1)!.latitudeDeg) vertices.pop();
      targets.push(checkedTarget({ ...common, targetType: "polygon", vertices, altitudeM: 0 }, targets.length));
    }
  }
  if (targets.length === 0) throw new Error("GeoJSON 中没有可导入的 Point 或 Polygon 目标。" );
  return targets;
}

export function parseTargetFile(text: string, fileName: string): GroundTargetConfig[] {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) return parseTargetCsv(text);
  if (lowerName.endsWith(".geojson") || lowerName.endsWith(".json")) {
    return parseTargetGeoJson(text);
  }
  throw new Error("目标文件必须是 .csv、.geojson 或 GeoJSON .json 文件。");
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  CustomDataSource,
  ComponentDatatype,
  Ellipsoid,
  EllipsoidTerrainProvider,
  Entity,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GridImageryProvider,
  HeadingPitchRange,
  ImageryLayer,
  JulianDate,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  ModelGraphics,
  PolylineDashMaterialProperty,
  PolygonHierarchy,
  Primitive,
  PrimitiveType,
  PerInstanceColorAppearance,
  Quaternion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  buildModuleUrl,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  DEG_TO_RAD,
} from "@spacedrone/orbital-core";
import { useSceneGeometry } from "../hooks/useSceneGeometry";
import { useTargetStates } from "../hooks/useTargetStates";
import { useOrbitPathSamples } from "../hooks/useOrbitPathSamples";
import { useSimulationStore } from "../stores/simulationStore";
import { downloadCanvasPng, timestampedFileName } from "../io/browserFiles";
import { targetRegionBoundary } from "../simulation/targetRegion";
import { computeSceneGeometry, type SceneGeometry } from "../simulation/sceneGeometry";
import { useCompanionOrbitPathSamples } from "../hooks/useCompanionOrbitPathSamples";
import { parseNaturalEarthBorderRings } from "./naturalEarthBorders";

interface ViewerEntities {
  earthReferences: Entity[];
  orbit: Entity;
  groundTrack: Entity;
  satellite: Entity;
  satelliteParts: Entity[];
  antenna: Entity;
  subpoint: Entity;
  link: Entity;
  lvlhAxes: [Entity, Entity, Entity];
  bodyAxes: [Entity, Entity, Entity];
  beamAxis: Entity;
  beamVolume: Entity;
  beamBoundaryRays: Entity;
  beamPerimeter: Entity;
  beamFaces: Entity[];
  footprint: Entity;
  beamCenterPoint: Entity;
}

interface ViewerHoverInfo {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

interface CompanionViewerEntities {
  orbit: Entity;
  groundTrack: Entity;
  satellite: Entity;
  beamAxis: Entity;
  footprint: Entity;
}

interface AdditionalBeamViewerEntities {
  phaseCenter: Entity;
  beamAxis: Entity;
  footprint: Entity;
}

function supportsWebGl(): boolean {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!context) return false;
  const loseContext = context.getExtension("WEBGL_lose_context");
  loseContext?.loseContext();
  return true;
}

const AXIS_COLORS = [
  Color.fromCssColorString("#ff6b6b"),
  Color.fromCssColorString("#52c41a"),
  Color.fromCssColorString("#4096ff"),
] as const;

function endpointAlong(
  origin: Cartesian3,
  direction: readonly [number, number, number],
  lengthM: number,
): Cartesian3 {
  return Cartesian3.add(
    origin,
    Cartesian3.multiplyByScalar(
      Cartesian3.fromElements(...direction),
      lengthM,
      new Cartesian3(),
    ),
    new Cartesian3(),
  );
}

function quaternionFromPositiveZ(direction: Cartesian3): Quaternion {
  const unitDirection = Cartesian3.normalize(direction, new Cartesian3());
  const cosine = CesiumMath.clamp(
    Cartesian3.dot(Cartesian3.UNIT_Z, unitDirection),
    -1,
    1,
  );
  if (cosine > 1 - 1e-12) {
    return Quaternion.clone(Quaternion.IDENTITY, new Quaternion());
  }
  if (cosine < -1 + 1e-12) {
    return Quaternion.fromAxisAngle(Cartesian3.UNIT_X, Math.PI, new Quaternion());
  }
  const axis = Cartesian3.normalize(
    Cartesian3.cross(Cartesian3.UNIT_Z, unitDirection, new Cartesian3()),
    new Cartesian3(),
  );
  return Quaternion.fromAxisAngle(axis, Math.acos(cosine), new Quaternion());
}

function isSatellitePick(pickedIds: Array<Entity | undefined>, entities: ViewerEntities): boolean {
  return pickedIds.includes(entities.satellite)
    || pickedIds.includes(entities.antenna)
    || entities.satelliteParts.some((part) => pickedIds.includes(part));
}

export function GlobeViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | undefined>(undefined);
  const gridLayerRef = useRef<ImageryLayer | undefined>(undefined);
  const earthTextureLayerRef = useRef<ImageryLayer | undefined>(undefined);
  const bordersRef = useRef<CustomDataSource | undefined>(undefined);
  const entitiesRef = useRef<ViewerEntities | undefined>(undefined);
  const targetEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const historyEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const unionEntitiesRef = useRef<Entity[]>([]);
  const companionEntitiesRef = useRef<Map<string, CompanionViewerEntities>>(new Map());
  const companionAdditionalBeamEntitiesRef = useRef<Map<string, Pick<AdditionalBeamViewerEntities, "beamAxis" | "footprint">>>(new Map());
  const additionalBeamEntitiesRef = useRef<Map<string, AdditionalBeamViewerEntities>>(new Map());
  const terrainPrimitiveRef = useRef<Primitive | undefined>(undefined);
  const hoverDataRef = useRef<{
    satellite?: SceneGeometry["satellite"];
    coverage?: SceneGeometry["coverage"];
  }>({});
  const processedScreenshotRevisionRef = useRef(0);
  const [hoverInfo, setHoverInfo] = useState<ViewerHoverInfo>();
  const [viewerError, setViewerError] = useState<string>();
  const orbit = useSimulationStore((state) => state.orbit);
  const setPickedLocation = useSimulationStore((state) => state.setPickedLocation);
  const sceneGeometry = useSceneGeometry();
  const satellite = sceneGeometry.satellite;
  const attitudeState = sceneGeometry.attitude;
  const coverage = sceneGeometry.coverage;
  const beamStates = sceneGeometry.beams;
  const antenna = useSimulationStore((state) => state.antenna);
  const companionSatellites = useSimulationStore((state) => state.companionSatellites);
  const elapsedSeconds = useSimulationStore((state) => state.elapsedSeconds);
  const targets = useSimulationStore((state) => state.targets);
  const terrain = useSimulationStore((state) => state.terrain);
  const coverageHistory = useSimulationStore((state) => state.coverageHistory);
  const coverageUnion = useSimulationStore((state) => state.coverageUnion);
  const historyDisplayMode = useSimulationStore((state) => state.missionSettings.historyDisplayMode);
  const targetStates = useTargetStates();
  const orbitPathState = useOrbitPathSamples(orbit);
  const companionPathState = useCompanionOrbitPathSamples(companionSatellites);
  const displaySettings = useSimulationStore((state) => state.displaySettings);
  const updateDisplaySettings = useSimulationStore((state) => state.updateDisplaySettings);
  const cameraResetRevision = useSimulationStore((state) => state.cameraResetRevision);
  const screenshotRevision = useSimulationStore((state) => state.screenshotRevision);
  hoverDataRef.current = { satellite, coverage };

  const companionScenes = useMemo(() => {
    const simulationDateUtc = new Date(Date.parse(orbit.epochUtc) + elapsedSeconds * 1000);
    return companionSatellites.filter((item) => item.enabled).map((item) => {
      try {
        return { item, scene: computeSceneGeometry({ orbit: item.orbit, attitude: item.attitude, antenna: item.antenna, targets, terrain, elapsedSeconds, simulationDateUtc }) };
      } catch (error) {
        return { item, error: error instanceof Error ? error.message : "伴飞星几何计算失败。" };
      }
    });
  }, [companionSatellites, elapsedSeconds, orbit.epochUtc, targets, terrain]);

  const paths = useMemo(() => {
    const samples = orbitPathState.result?.samples ?? [];
    const orbitPositions = samples.map((sample) =>
      Cartesian3.fromElements(...sample.orbitPositionEcefAtEpochM),
    );
    const groundTrackPositions = samples.map((sample) =>
      Cartesian3.fromDegrees(
        sample.satellite.longitudeDeg,
        sample.satellite.latitudeDeg,
        100,
      ),
    );
    return { orbitPositions, groundTrackPositions };
  }, [orbitPathState.result]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGl()) {
      setViewerError("浏览器 WebGL 不可用。请启用硬件加速、更新显卡驱动，然后重新加载页面。");
      return;
    }
    let viewer: Viewer;
    try {
      const earthTextureLayer = new ImageryLayer(new UrlTemplateImageryProvider({
        url: `${buildModuleUrl("Assets/Textures/NaturalEarthII")}/{z}/{x}/{reverseY}.jpg`,
        maximumLevel: 2,
        credit: "Natural Earth II (bundled with CesiumJS)",
      }));
      viewer = new Viewer(containerRef.current, {
      baseLayer: earthTextureLayer,
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true } },
      });
      earthTextureLayerRef.current = earthTextureLayer;
    } catch (error) {
      setViewerError(`Cesium 初始化失败：${error instanceof Error ? error.message : "未知错误"}。请检查 WebGL 和浏览器硬件加速。`);
      return;
    }
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.backgroundColor = Color.fromCssColorString("#020711");
    gridLayerRef.current = viewer.imageryLayers.addImageryProvider(
      new GridImageryProvider({
        cells: 18,
        color: Color.fromCssColorString("#8bd8ff").withAlpha(0.32),
        glowColor: Color.TRANSPARENT,
        backgroundColor: Color.TRANSPARENT,
      }),
    );
    const borders = new CustomDataSource("Natural Earth 1:110m 国界");
    borders.show = useSimulationStore.getState().displaySettings.showBorders;
    bordersRef.current = borders;
    void viewer.dataSources.add(borders);
    const borderAbortController = new AbortController();
    void fetch("/data/ne_110m_admin_0_countries.geojson", { signal: borderAbortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        if (viewer.isDestroyed() || borderAbortController.signal.aborted) return;
        const borderColor = Color.fromCssColorString("#ffe58f").withAlpha(0.8);
        for (const ring of parseNaturalEarthBorderRings(data)) {
          const positions = ring.map(([longitudeDeg, latitudeDeg]) =>
            Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, 1_000),
          );
          borders.entities.add({
            polyline: {
              positions,
              width: 1,
              arcType: ArcType.GEODESIC,
              material: borderColor,
            },
          });
        }
      })
      .catch((error: unknown) => {
        if (borderAbortController.signal.aborted || viewer.isDestroyed()) return;
        setViewerError(`国界图层加载失败：${error instanceof Error ? error.message : "数据格式错误"}。`);
      });
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(105, 20, 22_000_000),
    });
    viewerRef.current = viewer;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const pickedIds = viewer.scene
        .drillPick(movement.position)
        .map((picked) => (picked as { id?: Entity }).id);
      const entities = entitiesRef.current;
      if (
        entities
        && isSatellitePick(pickedIds, entities)
      ) {
        updateDisplaySettings({ cameraMode: "satellite" });
        return;
      }
      // MVP uses the WGS84 ellipsoid without terrain. Picking the rendered
      // terrain mesh can return a point below the ellipsoid at coarse LOD.
      const picked = viewer.camera.pickEllipsoid(movement.position, Ellipsoid.WGS84);
      if (!picked) return;
      const cartographic = Ellipsoid.WGS84.cartesianToCartographic(picked);
      setPickedLocation({
        longitudeDeg: CesiumMath.toDegrees(cartographic.longitude),
        latitudeDeg: CesiumMath.toDegrees(cartographic.latitude),
        altitudeM: cartographic.height,
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const pickedIds = viewer.scene
        .drillPick(movement.endPosition)
        .map((picked) => (picked as { id?: Entity }).id);
      const entities = entitiesRef.current;
      const data = hoverDataRef.current;
      if (
        entities
        && isSatellitePick(pickedIds, entities)
        && data.satellite
      ) {
        setHoverInfo({
          title: "卫星 SAT-1",
          lines: [
            data.satellite.dateUtc.toISOString(),
            `经纬高：${data.satellite.longitudeDeg.toFixed(4)}°, ${data.satellite.latitudeDeg.toFixed(4)}°, ${(data.satellite.altitudeM / 1000).toFixed(2)} km`,
            `速度：${(data.satellite.speedMps / 1000).toFixed(4)} km/s`,
          ],
          x: movement.endPosition.x,
          y: movement.endPosition.y,
        });
      } else if (
        entities
        && (
          pickedIds.includes(entities.footprint)
          || pickedIds.includes(entities.beamPerimeter)
          || pickedIds.includes(entities.beamCenterPoint)
        )
        && data.coverage?.isClosed
      ) {
        setHoverInfo({
          title: "当前覆盖区",
          lines: [
            `中心：${data.coverage.centerGeodetic ? `${(data.coverage.centerGeodetic.longitudeRad * 180 / Math.PI).toFixed(4)}°, ${(data.coverage.centerGeodetic.latitudeRad * 180 / Math.PI).toFixed(4)}°` : "—"}`,
            `面积：${data.coverage.localProjectedAreaM2 !== undefined ? `${(data.coverage.localProjectedAreaM2 / 1e6).toFixed(2)} km²` : "—"}`,
            `入射角：${data.coverage.incidenceAngleRad !== undefined ? `${(data.coverage.incidenceAngleRad * 180 / Math.PI).toFixed(2)}°` : "—"}`,
          ],
          x: movement.endPosition.x,
          y: movement.endPosition.y,
        });
      } else {
        setHoverInfo(undefined);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.camera.pickEllipsoid(movement.position, Ellipsoid.WGS84);
      if (!picked) return;
      const cartographic = Ellipsoid.WGS84.cartesianToCartographic(picked);
      setPickedLocation({
        longitudeDeg: CesiumMath.toDegrees(cartographic.longitude),
        latitudeDeg: CesiumMath.toDegrees(cartographic.latitude),
        altitudeM: cartographic.height,
      });
      viewer.camera.flyTo({
        destination: Cartesian3.fromRadians(
          cartographic.longitude,
          cartographic.latitude,
          1_200_000,
        ),
        duration: 0.8,
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setViewerError("WebGL 上下文已丢失。请关闭占用显存的页面、启用硬件加速后重新加载。");
    };
    viewer.scene.canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      borderAbortController.abort();
      handler.destroy();
      viewer.scene.canvas.removeEventListener("webglcontextlost", onContextLost);
      viewer.destroy();
      viewerRef.current = undefined;
      terrainPrimitiveRef.current = undefined;
      gridLayerRef.current = undefined;
      earthTextureLayerRef.current = undefined;
      bordersRef.current = undefined;
      entitiesRef.current = undefined;
      companionEntitiesRef.current.clear();
      companionAdditionalBeamEntitiesRef.current.clear();
      additionalBeamEntitiesRef.current.clear();
    };
  }, [setPickedLocation, updateDisplaySettings]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (terrainPrimitiveRef.current) {
      viewer.scene.primitives.remove(terrainPrimitiveRef.current);
      terrainPrimitiveRef.current = undefined;
    }
    const grid = terrain.enabled ? terrain.grid : null;
    if (!grid) return;
    const longitudeCount = grid.longitudeDeg.length;
    const latitudeCount = grid.latitudeDeg.length;
    const positions: number[] = [];
    for (let latitudeIndex = 0; latitudeIndex < latitudeCount; latitudeIndex += 1) {
      for (let longitudeIndex = 0; longitudeIndex < longitudeCount; longitudeIndex += 1) {
        const point = Cartesian3.fromDegrees(
          grid.longitudeDeg[longitudeIndex],
          grid.latitudeDeg[latitudeIndex],
          grid.heightM[latitudeIndex][longitudeIndex],
        );
        positions.push(point.x, point.y, point.z);
      }
    }
    const triangleIndexCount = (longitudeCount - 1) * (latitudeCount - 1) * 6;
    const indices = positions.length / 3 > 65_535
      ? new Uint32Array(triangleIndexCount)
      : new Uint16Array(triangleIndexCount);
    let cursor = 0;
    for (let latitudeIndex = 0; latitudeIndex < latitudeCount - 1; latitudeIndex += 1) {
      for (let longitudeIndex = 0; longitudeIndex < longitudeCount - 1; longitudeIndex += 1) {
        const southwest = latitudeIndex * longitudeCount + longitudeIndex;
        const southeast = southwest + 1;
        const northwest = southwest + longitudeCount;
        const northeast = northwest + 1;
        indices[cursor++] = southwest;
        indices[cursor++] = southeast;
        indices[cursor++] = northeast;
        indices[cursor++] = southwest;
        indices[cursor++] = northeast;
        indices[cursor++] = northwest;
      }
    }
    const color = Color.fromCssColorString(terrain.color).withAlpha(terrain.opacity);
    const attributes = new GeometryAttributes();
    attributes.position = new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: new Float64Array(positions),
    });
    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new Geometry({
          attributes,
          indices,
          primitiveType: PrimitiveType.TRIANGLES,
          boundingSphere: BoundingSphere.fromVertices(positions),
        }),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
      }),
      appearance: new PerInstanceColorAppearance({
        flat: true,
        translucent: terrain.opacity < 1,
        closed: false,
        faceForward: true,
      }),
      asynchronous: false,
    });
    viewer.scene.primitives.add(primitive);
    terrainPrimitiveRef.current = primitive;
    return () => {
      if (!viewer.isDestroyed() && terrainPrimitiveRef.current === primitive) {
        viewer.scene.primitives.remove(primitive);
        terrainPrimitiveRef.current = undefined;
      }
    };
  }, [terrain]);

  useEffect(() => {
    if (screenshotRevision === 0 || screenshotRevision === processedScreenshotRevisionRef.current) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    processedScreenshotRevisionRef.current = screenshotRevision;
    viewer.render();
    void downloadCanvasPng(
      viewer.scene.canvas,
      timestampedFileName("spacedrone-view", "png"),
    ).catch((error: unknown) => {
      setViewerError(error instanceof Error ? error.message : "截图导出失败，请重试。");
    });
  }, [screenshotRevision]);

  useEffect(() => {
    if (!earthTextureLayerRef.current) return;
    earthTextureLayerRef.current.show = displaySettings.showEarthTexture;
  }, [displaySettings.showEarthTexture]);

  useEffect(() => {
    if (!gridLayerRef.current) return;
    gridLayerRef.current.show = displaySettings.showGrid;
  }, [displaySettings.showGrid]);

  useEffect(() => {
    if (!bordersRef.current) return;
    bordersRef.current.show = displaySettings.showBorders;
  }, [displaySettings.showBorders]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(105, 20, 22_000_000) });
  }, [cameraResetRevision]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || paths.orbitPositions.length < 2) return;
    viewer.entities.removeAll();
    targetEntitiesRef.current.clear();
    historyEntitiesRef.current.clear();
    unionEntitiesRef.current = [];
    companionEntitiesRef.current.clear();
    companionAdditionalBeamEntitiesRef.current.clear();
    additionalBeamEntitiesRef.current.clear();
    const orbitEntity = viewer.entities.add({
      name: "三维轨道线",
      polyline: {
        positions: paths.orbitPositions,
        width: 1.5,
        material: Color.fromCssColorString("#4ecfff").withAlpha(0.75),
      },
    });
    const groundTrackEntity = viewer.entities.add({
      name: "地面航迹",
      polyline: {
        positions: paths.groundTrackPositions,
        width: 2,
        material: Color.fromCssColorString("#ffcc66"),
        clampToGround: false,
      },
    });
    const earthReferenceRadiusM = Ellipsoid.WGS84.maximumRadius * 1.13;
    const earthReferences = [
      viewer.entities.add({
        name: "地心",
        position: Cartesian3.ZERO,
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString("#ff4d4f"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: "地心 O",
          font: "13px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cartesian2(0, -20),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
      viewer.entities.add({
        name: "地球自转轴",
        polyline: {
          positions: [
            new Cartesian3(0, 0, -earthReferenceRadiusM),
            new Cartesian3(0, 0, earthReferenceRadiusM),
          ],
          width: 2,
          arcType: ArcType.NONE,
          material: Color.fromCssColorString("#ff7875"),
          depthFailMaterial: Color.fromCssColorString("#ff7875").withAlpha(0.35),
        },
      }),
      viewer.entities.add({
        name: "赤道平面",
        position: Cartesian3.ZERO,
        ellipsoid: {
          radii: new Cartesian3(earthReferenceRadiusM, earthReferenceRadiusM, 6_000),
          material: Color.fromCssColorString("#40a9ff").withAlpha(0.12),
          outline: true,
          outlineColor: Color.fromCssColorString("#69c0ff").withAlpha(0.8),
        },
      }),
    ];
    const satelliteEntity = viewer.entities.add({
      name: "卫星",
      position: Cartesian3.ZERO,
      point: {
        pixelSize: 13,
        color: Color.WHITE,
        outlineColor: Color.fromCssColorString("#40a9ff"),
        outlineWidth: 4,
      },
      model: new ModelGraphics({
        show: false,
        scale: 1,
        minimumPixelSize: 48,
        maximumScale: 200_000,
      }),
      label: {
        text: "SAT-1",
        font: "14px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cartesian2(0, -24),
      },
    });
    const satelliteParts = [
      viewer.entities.add({
        name: "卫星简化机身",
        position: Cartesian3.ZERO,
        orientation: Quaternion.IDENTITY,
        box: {
          dimensions: new Cartesian3(48_000, 34_000, 32_000),
          material: Color.fromCssColorString("#d9d9d9"),
          outline: true,
          outlineColor: Color.WHITE,
        },
      }),
      viewer.entities.add({
        name: "卫星左太阳翼",
        position: Cartesian3.ZERO,
        orientation: Quaternion.IDENTITY,
        box: {
          dimensions: new Cartesian3(38_000, 76_000, 4_000),
          material: Color.fromCssColorString("#1769aa"),
          outline: true,
          outlineColor: Color.fromCssColorString("#8ed9f8"),
        },
      }),
      viewer.entities.add({
        name: "卫星右太阳翼",
        position: Cartesian3.ZERO,
        orientation: Quaternion.IDENTITY,
        box: {
          dimensions: new Cartesian3(38_000, 76_000, 4_000),
          material: Color.fromCssColorString("#1769aa"),
          outline: true,
          outlineColor: Color.fromCssColorString("#8ed9f8"),
        },
      }),
      viewer.entities.add({
        name: "卫星天线图标",
        position: Cartesian3.ZERO,
        orientation: Quaternion.IDENTITY,
        cylinder: {
          length: 18_000,
          topRadius: 5_000,
          bottomRadius: 20_000,
          material: Color.fromCssColorString("#fadb14"),
          outline: true,
          outlineColor: Color.WHITE,
        },
      }),
    ];
    const antennaEntity = viewer.entities.add({
      name: "天线相位中心",
      position: Cartesian3.ZERO,
      point: {
        pixelSize: 7,
        color: Color.fromCssColorString("#fadb14"),
        outlineColor: Color.WHITE,
        outlineWidth: 1,
      },
    });
    const subpointEntity = viewer.entities.add({
      name: "当前星下点",
      position: Cartesian3.ZERO,
      point: {
        pixelSize: 9,
        color: Color.fromCssColorString("#ff4d4f"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },
    });
    const linkEntity = viewer.entities.add({
      name: "星下连线",
      polyline: {
        positions: [Cartesian3.ZERO, Cartesian3.ZERO],
        width: 1,
        material: Color.WHITE.withAlpha(0.45),
      },
    });
    const lvlhAxes = AXIS_COLORS.map((color, index) =>
      viewer.entities.add({
        name: `LVLH ${["+X 沿航迹", "+Y 横航迹", "+Z 天底"][index]}`,
        polyline: {
          positions: [Cartesian3.ZERO, Cartesian3.ZERO],
          width: 2,
          material: new PolylineDashMaterialProperty({
            color: color.withAlpha(0.65),
            dashLength: 12,
          }),
        },
      }),
    ) as [Entity, Entity, Entity];
    const bodyAxes = AXIS_COLORS.map((color, index) =>
      viewer.entities.add({
        name: `本体 +${["X", "Y", "Z"][index]}`,
        polyline: {
          positions: [Cartesian3.ZERO, Cartesian3.ZERO],
          width: 3,
          material: color,
        },
      }),
    ) as [Entity, Entity, Entity];
    const beamAxis = viewer.entities.add({
      name: "天线波束中心轴",
      polyline: {
        positions: [Cartesian3.ZERO, Cartesian3.ZERO],
        width: 2.5,
        material: Color.fromCssColorString("#fadb14"),
      },
    });
    const beamVolume = viewer.entities.add({
      name: "圆锥波束体",
      position: Cartesian3.ZERO,
      orientation: Quaternion.IDENTITY,
      cylinder: {
        length: 1,
        topRadius: 1,
        bottomRadius: 0,
        material: Color.fromCssColorString("#fadb14").withAlpha(0.2),
        outline: true,
        outlineColor: Color.fromCssColorString("#ffe58f").withAlpha(0.7),
      },
    });
    const beamBoundaryRays = viewer.entities.add({
      name: "波束边界射线",
      polyline: {
        positions: [Cartesian3.ZERO, Cartesian3.ZERO],
        width: 1,
        material: Color.fromCssColorString("#ffe58f").withAlpha(0.65),
      },
    });
    const beamPerimeter = viewer.entities.add({
      name: "波束地面交线",
      polyline: {
        positions: [Cartesian3.ZERO, Cartesian3.ZERO],
        width: 2,
        material: Color.fromCssColorString("#36cfc9"),
      },
    });
    const beamFaces = Array.from({ length: 16 }, (_, index) =>
      viewer.entities.add({
        name: `波束侧面 ${index + 1}`,
        polygon: {
          hierarchy: new PolygonHierarchy([
            Cartesian3.ZERO,
            Cartesian3.ZERO,
            Cartesian3.ZERO,
          ]),
          perPositionHeight: true,
          material: Color.fromCssColorString("#fadb14").withAlpha(0.055),
          outline: false,
        },
      }),
    );
    const footprint = viewer.entities.add({
      name: "当前瞬时覆盖区",
      polygon: {
        hierarchy: new PolygonHierarchy([
          Cartesian3.ZERO,
          Cartesian3.ZERO,
          Cartesian3.ZERO,
        ]),
        perPositionHeight: true,
        material: Color.fromCssColorString("#13c2c2").withAlpha(0.42),
        outline: true,
        outlineColor: Color.fromCssColorString("#87e8de"),
      },
    });
    const beamCenterPoint = viewer.entities.add({
      name: "波束中心地面点",
      position: Cartesian3.ZERO,
      point: {
        pixelSize: 8,
        color: Color.fromCssColorString("#fadb14"),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
      },
    });
    entitiesRef.current = {
      earthReferences,
      orbit: orbitEntity,
      groundTrack: groundTrackEntity,
      satellite: satelliteEntity,
      satelliteParts,
      antenna: antennaEntity,
      subpoint: subpointEntity,
      link: linkEntity,
      lvlhAxes,
      bodyAxes,
      beamAxis,
      beamVolume,
      beamBoundaryRays,
      beamPerimeter,
      beamFaces,
      footprint,
      beamCenterPoint,
    };
  }, [paths]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !entitiesRef.current) return;
    for (const entities of additionalBeamEntitiesRef.current.values()) {
      viewer.entities.remove(entities.phaseCenter);
      viewer.entities.remove(entities.beamAxis);
      viewer.entities.remove(entities.footprint);
    }
    additionalBeamEntitiesRef.current.clear();
    for (const feed of antenna.arrayFeeds.filter((item) => item.enabled)) {
      const color = Color.fromCssColorString(feed.color);
      additionalBeamEntitiesRef.current.set(feed.id, {
        phaseCenter: viewer.entities.add({
          name: `${feed.name} 相位中心`,
          position: Cartesian3.ZERO,
          point: { pixelSize: 6, color, outlineColor: Color.WHITE, outlineWidth: 1 },
        }),
        beamAxis: viewer.entities.add({
          name: `${feed.name} 波束中心轴`,
          polyline: { positions: [Cartesian3.ZERO, Cartesian3.ZERO], width: 2, material: color.withAlpha(0.9) },
        }),
        footprint: viewer.entities.add({
          name: `${feed.name} 瞬时覆盖区`,
          polygon: {
            hierarchy: new PolygonHierarchy([Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO]),
            perPositionHeight: true,
            material: color.withAlpha(Math.min(0.65, antenna.beamOpacity * 1.8)),
            outline: true,
            outlineColor: color.withAlpha(0.95),
          },
        }),
      });
    }
  }, [antenna.arrayFeeds, antenna.beamOpacity, paths]);

  useEffect(() => {
    for (const beam of beamStates.slice(1)) {
      const entities = additionalBeamEntitiesRef.current.get(beam.id);
      if (!entities) continue;
      const origin = Cartesian3.fromElements(...beam.originEcefM);
      entities.phaseCenter.position = new ConstantPositionProperty(origin);
      entities.phaseCenter.show = displaySettings.showBeam;
      if (entities.beamAxis.polyline) {
        const distanceM = beam.centerIntersection?.distanceM ?? antenna.maxDisplayDistanceM;
        entities.beamAxis.polyline.positions = new ConstantProperty([
          origin,
          endpointAlong(origin, beam.centerDirectionEcef, distanceM),
        ]);
      }
      entities.beamAxis.show = displaySettings.showBeam;
      if (entities.footprint.polygon) {
        entities.footprint.polygon.show = new ConstantProperty(displaySettings.showFootprint && beam.isClosed);
        entities.footprint.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(
          beam.isClosed
            ? beam.vertices.map((vertex) => Cartesian3.fromElements(...vertex.pointEcefM))
            : [Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO],
        ));
      }
      entities.footprint.show = displaySettings.showFootprint;
    }
  }, [antenna.maxDisplayDistanceM, beamStates, displaySettings.showBeam, displaySettings.showFootprint]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !entitiesRef.current) return;
    for (const entities of companionEntitiesRef.current.values()) {
      viewer.entities.remove(entities.orbit); viewer.entities.remove(entities.groundTrack);
      viewer.entities.remove(entities.satellite); viewer.entities.remove(entities.beamAxis); viewer.entities.remove(entities.footprint);
    }
    for (const entities of companionAdditionalBeamEntitiesRef.current.values()) {
      viewer.entities.remove(entities.beamAxis);
      viewer.entities.remove(entities.footprint);
    }
    companionEntitiesRef.current.clear();
    companionAdditionalBeamEntitiesRef.current.clear();
    for (const companion of companionSatellites.filter((satellite) => satellite.enabled)) {
      const samples = companionPathState.results[companion.id]?.samples ?? [];
      if (samples.length < 2) continue;
      const color = Color.fromCssColorString(companion.color) ?? Color.MAGENTA;
      const orbitEntity = viewer.entities.add({
        name: `${companion.name} 三维轨道线`,
        polyline: { positions: samples.map((sample) => Cartesian3.fromElements(...sample.orbitPositionEcefAtEpochM)), width: 1.3, material: color.withAlpha(0.72) },
      });
      const groundTrack = viewer.entities.add({
        name: `${companion.name} 地面航迹`,
        polyline: { positions: samples.map((sample) => Cartesian3.fromDegrees(sample.satellite.longitudeDeg, sample.satellite.latitudeDeg, 120)), width: 1.5, material: color.withAlpha(0.65) },
      });
      const satelliteEntity = viewer.entities.add({
        name: companion.name, position: Cartesian3.ZERO,
        point: { pixelSize: 12, color, outlineColor: Color.WHITE, outlineWidth: 2 },
        label: { text: companion.name, font: "13px sans-serif", fillColor: color, outlineColor: Color.BLACK, outlineWidth: 2, pixelOffset: new Cartesian2(0, -22) },
      });
      const beamAxis = viewer.entities.add({
        name: `${companion.name} 波束中心轴`,
        polyline: { positions: [Cartesian3.ZERO, Cartesian3.ZERO], width: 1.8, material: color.withAlpha(0.9) },
      });
      const footprint = viewer.entities.add({
        name: `${companion.name} 当前覆盖区`,
        polygon: { hierarchy: new PolygonHierarchy([Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO]), perPositionHeight: true, material: color.withAlpha(0.22), outline: true, outlineColor: color.withAlpha(0.85) },
      });
      companionEntitiesRef.current.set(companion.id, { orbit: orbitEntity, groundTrack, satellite: satelliteEntity, beamAxis, footprint });
    }
  }, [companionPathState.results, companionSatellites, paths]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const activeAdditionalBeamKeys = new Set<string>();
    for (const item of companionScenes) {
      const entities = companionEntitiesRef.current.get(item.item.id);
      if (!entities || !("scene" in item) || !item.scene) continue;
      const scene: SceneGeometry = item.scene;
      const satellitePosition = Cartesian3.fromElements(...scene.satellite.positionEcefM);
      entities.satellite.position = new ConstantPositionProperty(satellitePosition);
      if (entities.beamAxis.polyline) {
        const distanceM = scene.coverage.centerIntersection?.distanceM ?? item.item.antenna.maxDisplayDistanceM;
        entities.beamAxis.polyline.positions = new ConstantProperty([
          Cartesian3.fromElements(...scene.coverage.originEcefM),
          endpointAlong(Cartesian3.fromElements(...scene.coverage.originEcefM), scene.coverage.centerDirectionEcef, distanceM),
        ]);
      }
      if (entities.footprint.polygon) {
        entities.footprint.polygon.show = new ConstantProperty(scene.coverage.isClosed);
        entities.footprint.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(
          scene.coverage.isClosed ? scene.coverage.vertices.map((vertex) => Cartesian3.fromElements(...vertex.pointEcefM)) : [Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO],
        ));
      }
      entities.orbit.show = displaySettings.showOrbit;
      entities.groundTrack.show = displaySettings.showGroundTrack;
      entities.satellite.show = true;
      entities.beamAxis.show = displaySettings.showBeam;
      entities.footprint.show = displaySettings.showFootprint;
      for (const beam of scene.beams.slice(1)) {
        const key = `${item.item.id}:${beam.id}`;
        activeAdditionalBeamKeys.add(key);
        let additional = companionAdditionalBeamEntitiesRef.current.get(key);
        if (!additional) {
          const color = Color.fromCssColorString(beam.color);
          additional = {
            beamAxis: viewer.entities.add({
              name: `${item.item.name} / ${beam.name} 波束中心轴`,
              polyline: { positions: [Cartesian3.ZERO, Cartesian3.ZERO], width: 1.5, material: color.withAlpha(0.85) },
            }),
            footprint: viewer.entities.add({
              name: `${item.item.name} / ${beam.name} 当前覆盖区`,
              polygon: {
                hierarchy: new PolygonHierarchy([Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO]),
                perPositionHeight: true,
                material: color.withAlpha(0.18),
                outline: true,
                outlineColor: color.withAlpha(0.75),
              },
            }),
          };
          companionAdditionalBeamEntitiesRef.current.set(key, additional);
        }
        const origin = Cartesian3.fromElements(...beam.originEcefM);
        if (additional.beamAxis.polyline) {
          additional.beamAxis.polyline.positions = new ConstantProperty([
            origin,
            endpointAlong(origin, beam.centerDirectionEcef, beam.centerIntersection?.distanceM ?? item.item.antenna.maxDisplayDistanceM),
          ]);
        }
        additional.beamAxis.show = displaySettings.showBeam;
        if (additional.footprint.polygon) {
          additional.footprint.polygon.show = new ConstantProperty(beam.isClosed);
          additional.footprint.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(
            beam.isClosed ? beam.vertices.map((vertex) => Cartesian3.fromElements(...vertex.pointEcefM)) : [Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO],
          ));
        }
        additional.footprint.show = displaySettings.showFootprint;
      }
    }
    for (const [key, additional] of companionAdditionalBeamEntitiesRef.current) {
      if (activeAdditionalBeamKeys.has(key)) continue;
      viewer.entities.remove(additional.beamAxis);
      viewer.entities.remove(additional.footprint);
      companionAdditionalBeamEntitiesRef.current.delete(key);
    }
  }, [companionScenes, displaySettings.showBeam, displaySettings.showFootprint, displaySettings.showGroundTrack, displaySettings.showOrbit]);

  useEffect(() => {
    const entities = entitiesRef.current;
    if (!entities) return;
    const satellitePosition = Cartesian3.fromElements(...satellite.positionEcefM);
    const antennaPosition = Cartesian3.fromElements(...coverage.originEcefM);
    const beamColor = Color.fromCssColorString(antenna.beamColor) ?? Color.YELLOW;
    const subpointPosition = Cartesian3.fromDegrees(
      satellite.longitudeDeg,
      satellite.latitudeDeg,
      100,
    );
    entities.satellite.position = new ConstantPositionProperty(satellitePosition);
    const [bodyX, bodyY, bodyZ] = attitudeState.bodyAxesEcef;
    const bodyOrientation = Quaternion.fromRotationMatrix(Matrix3.fromArray([
      ...bodyX,
      ...bodyY,
      ...bodyZ,
    ]));
    entities.satellite.orientation = new ConstantProperty(bodyOrientation);
    const customModelEnabled = displaySettings.satelliteModelUrl.trim().length > 0;
    if (entities.satellite.point) entities.satellite.point.show = new ConstantProperty(!customModelEnabled);
    if (entities.satellite.model) {
      entities.satellite.model.show = new ConstantProperty(customModelEnabled);
      entities.satellite.model.uri = new ConstantProperty(displaySettings.satelliteModelUrl);
      entities.satellite.model.scale = new ConstantProperty(displaySettings.satelliteScale);
    }
    entities.satelliteParts.forEach((part) => {
      part.orientation = new ConstantProperty(bodyOrientation);
      part.show = !customModelEnabled;
    });
    const satelliteScale = displaySettings.satelliteScale;
    entities.satelliteParts[0].position = new ConstantPositionProperty(satellitePosition);
    entities.satelliteParts[1].position = new ConstantPositionProperty(endpointAlong(satellitePosition, bodyY, 62_000 * satelliteScale));
    entities.satelliteParts[2].position = new ConstantPositionProperty(endpointAlong(satellitePosition, bodyY, -62_000 * satelliteScale));
    entities.satelliteParts[3].position = new ConstantPositionProperty(endpointAlong(satellitePosition, bodyZ, 24_000 * satelliteScale));
    if (entities.satelliteParts[0].box) {
      entities.satelliteParts[0].box.dimensions = new ConstantProperty(
        Cartesian3.multiplyByScalar(new Cartesian3(48_000, 34_000, 32_000), satelliteScale, new Cartesian3()),
      );
    }
    for (const panel of entities.satelliteParts.slice(1, 3)) {
      if (panel.box) {
        panel.box.dimensions = new ConstantProperty(
          Cartesian3.multiplyByScalar(new Cartesian3(38_000, 76_000, 4_000), satelliteScale, new Cartesian3()),
        );
      }
    }
    const dish = entities.satelliteParts[3].cylinder;
    if (dish) {
      dish.length = new ConstantProperty(18_000 * satelliteScale);
      dish.topRadius = new ConstantProperty(5_000 * satelliteScale);
      dish.bottomRadius = new ConstantProperty(20_000 * satelliteScale);
    }
    entities.subpoint.position = new ConstantPositionProperty(subpointPosition);
    if (entities.link.polyline) {
      entities.link.polyline.positions = new ConstantProperty([
        satellitePosition,
        subpointPosition,
      ]);
    }
    entities.antenna.position = new ConstantPositionProperty(antennaPosition);
    const setAxisLine = (
      entity: Entity,
      direction: readonly [number, number, number],
      lengthM: number,
      origin = satellitePosition,
    ) => {
      if (entity.polyline) {
        entity.polyline.positions = new ConstantProperty([
          origin,
          endpointAlong(origin, direction, lengthM),
        ]);
      }
    };
    attitudeState.lvlhAxesEcef.forEach((axis, index) =>
      setAxisLine(entities.lvlhAxes[index], axis, 160_000),
    );
    attitudeState.bodyAxesEcef.forEach((axis, index) =>
      setAxisLine(entities.bodyAxes[index], axis, 110_000),
    );
    const beamLengthM =
      coverage.centerIntersection?.distanceM ?? antenna.maxDisplayDistanceM;
    setAxisLine(entities.beamAxis, coverage.centerDirectionEcef, beamLengthM, antennaPosition);

    const beamDirection = Cartesian3.fromElements(...coverage.centerDirectionEcef);
    const beamMidpoint = Cartesian3.add(
      antennaPosition,
      Cartesian3.multiplyByScalar(
        beamDirection,
        beamLengthM / 2,
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    entities.beamVolume.position = new ConstantPositionProperty(beamMidpoint);
    entities.beamVolume.orientation = new ConstantProperty(
      quaternionFromPositiveZ(beamDirection),
    );
    if (entities.beamVolume.cylinder) {
      entities.beamVolume.cylinder.length = new ConstantProperty(
        beamLengthM,
      );
      entities.beamVolume.cylinder.show = new ConstantProperty(
        antenna.beamType === "circular",
      );
      entities.beamVolume.cylinder.bottomRadius = new ConstantProperty(0);
      entities.beamVolume.cylinder.topRadius = new ConstantProperty(
        beamLengthM *
          Math.tan((antenna.circularBeamwidthDeg * DEG_TO_RAD) / 2),
      );
      entities.beamVolume.cylinder.material = new ColorMaterialProperty(
        beamColor.withAlpha(antenna.beamOpacity),
      );
      entities.beamVolume.cylinder.outlineColor = new ConstantProperty(
        beamColor.withAlpha(Math.max(antenna.beamOpacity, 0.55)),
      );
    }
    if (entities.beamAxis.polyline) entities.beamAxis.polyline.material = new ColorMaterialProperty(beamColor);

    const boundaryEndpoints = coverage.isClosed
      ? coverage.vertices.map((vertex) => Cartesian3.fromElements(...vertex.pointEcefM))
      : coverage.boundaryDirectionsEcef.map((direction) =>
          endpointAlong(satellitePosition, direction, antenna.maxDisplayDistanceM),
        );
    const displayedRayCount = Math.min(16, boundaryEndpoints.length);
    const rayPositions: Cartesian3[] = [];
    for (let index = 0; index < displayedRayCount; index += 1) {
      const boundaryIndex = Math.floor((index * boundaryEndpoints.length) / displayedRayCount);
      rayPositions.push(antennaPosition, boundaryEndpoints[boundaryIndex], antennaPosition);
    }
    if (entities.beamBoundaryRays.polyline) {
      entities.beamBoundaryRays.polyline.positions = new ConstantProperty(rayPositions);
      entities.beamBoundaryRays.polyline.material = new ColorMaterialProperty(beamColor.withAlpha(Math.max(antenna.beamOpacity, 0.4)));
    }

    if (entities.beamPerimeter.polyline) {
      entities.beamPerimeter.polyline.show = new ConstantProperty(coverage.isClosed);
      entities.beamPerimeter.polyline.positions = new ConstantProperty(
        coverage.isClosed && boundaryEndpoints.length > 0
          ? [...boundaryEndpoints, boundaryEndpoints[0]]
          : [Cartesian3.ZERO, Cartesian3.ZERO],
      );
      entities.beamPerimeter.polyline.material = new ColorMaterialProperty(beamColor.withAlpha(0.9));
    }
    entities.beamFaces.forEach((face, index) => {
      if (!face.polygon || boundaryEndpoints.length < 3) return;
      const firstIndex = Math.floor((index * boundaryEndpoints.length) / entities.beamFaces.length);
      const secondIndex = Math.floor(
        (((index + 1) % entities.beamFaces.length) * boundaryEndpoints.length) /
          entities.beamFaces.length,
      );
      face.polygon.hierarchy = new ConstantProperty(
        new PolygonHierarchy([
          antennaPosition,
          boundaryEndpoints[firstIndex],
          boundaryEndpoints[secondIndex],
        ]),
      );
      face.polygon.material = new ColorMaterialProperty(beamColor.withAlpha(antenna.beamOpacity * 0.3));
    });

    if (entities.footprint.polygon) {
      entities.footprint.polygon.show = new ConstantProperty(coverage.isClosed);
      entities.footprint.polygon.hierarchy = new ConstantProperty(
        new PolygonHierarchy(
          coverage.isClosed
            ? coverage.vertices.map((vertex) => Cartesian3.fromElements(...vertex.pointEcefM))
            : [Cartesian3.ZERO, Cartesian3.ZERO, Cartesian3.ZERO],
        ),
      );
      entities.footprint.polygon.material = new ColorMaterialProperty(beamColor.withAlpha(Math.min(0.65, antenna.beamOpacity * 1.8)));
      entities.footprint.polygon.outlineColor = new ConstantProperty(beamColor.withAlpha(0.95));
    }
    const centerPoint = coverage.centerIntersection
      ? Cartesian3.fromElements(...coverage.centerIntersection.pointEcefM)
      : Cartesian3.ZERO;
    entities.beamCenterPoint.position = new ConstantPositionProperty(centerPoint);
    if (entities.beamCenterPoint.point) {
      entities.beamCenterPoint.point.show = new ConstantProperty(
        coverage.centerIntersection !== undefined,
      );
    }
    const viewer = viewerRef.current;
    if (viewer) viewer.clock.currentTime = JulianDate.fromDate(satellite.dateUtc);
  }, [antenna, attitudeState, coverage, displaySettings.satelliteScale, paths, satellite]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (displaySettings.cameraMode === "free") {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      return;
    }
    const target = displaySettings.cameraMode === "satellite"
      ? Cartesian3.fromElements(...satellite.positionEcefM)
      : displaySettings.cameraMode === "beamCenter" && coverage.centerIntersection
        ? Cartesian3.fromElements(...coverage.centerIntersection.pointEcefM)
        : Cartesian3.fromDegrees(satellite.longitudeDeg, satellite.latitudeDeg, 100);
    const rangeM = displaySettings.cameraMode === "satellite" ? 1_800_000 : 2_800_000;
    viewer.camera.lookAt(target, new HeadingPitchRange(0, -0.55, rangeM));
  }, [coverage.centerIntersection, displaySettings.cameraMode, satellite]);

  useEffect(() => {
    const entities = entitiesRef.current;
    const viewer = viewerRef.current;
    if (!entities || !viewer) return;
    entities.earthReferences.forEach((entity) => { entity.show = displaySettings.showEarthReferences; });
    viewer.scene.globe.enableLighting = displaySettings.lightingEnabled;
    entities.orbit.show = displaySettings.showOrbit;
    entities.groundTrack.show = displaySettings.showGroundTrack;
    entities.subpoint.show = displaySettings.showGroundTrack;
    entities.link.show = displaySettings.showGroundTrack;
    entities.lvlhAxes.forEach((entity) => { entity.show = displaySettings.showAxes; });
    entities.bodyAxes.forEach((entity) => { entity.show = displaySettings.showAxes; });
    entities.antenna.show = displaySettings.showBeam;
    entities.beamAxis.show = displaySettings.showBeam;
    entities.beamVolume.show = displaySettings.showBeam;
    entities.beamBoundaryRays.show = displaySettings.showBeam;
    entities.beamPerimeter.show = displaySettings.showBeam;
    entities.beamFaces.forEach((entity) => { entity.show = displaySettings.showBeam; });
    entities.beamCenterPoint.show = displaySettings.showBeam;
    entities.footprint.show = displaySettings.showFootprint;
    for (const companion of companionEntitiesRef.current.values()) {
      companion.orbit.show = displaySettings.showOrbit;
      companion.groundTrack.show = displaySettings.showGroundTrack;
      companion.beamAxis.show = displaySettings.showBeam;
      companion.footprint.show = displaySettings.showFootprint;
    }
    for (const entity of targetEntitiesRef.current.values()) entity.show = displaySettings.showTargets;
    for (const entity of historyEntitiesRef.current.values()) entity.show = displaySettings.showHistory;
    for (const entity of unionEntitiesRef.current) entity.show = displaySettings.showHistory;
  }, [displaySettings, paths]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const activeIds = new Set(targets.map((target) => target.id));
    for (const [id, entity] of targetEntitiesRef.current) {
      if (!activeIds.has(id)) {
        viewer.entities.remove(entity);
        targetEntitiesRef.current.delete(id);
      }
    }
    for (const target of targets) {
      if (targetEntitiesRef.current.has(target.id)) continue;
      const regionBoundary = targetRegionBoundary(target);
      const entity = viewer.entities.add({
        name: target.name,
        position: Cartesian3.fromDegrees(
          target.longitudeDeg,
          target.latitudeDeg,
          target.altitudeM + 50,
        ),
        point: {
          pixelSize: target.targetType === "point" ? 11 : 7,
          color: Color.fromCssColorString("#fa8c16"),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
        polygon: regionBoundary ? {
          hierarchy: new PolygonHierarchy(regionBoundary.map((point) => Cartesian3.fromDegrees(point.longitudeDeg, point.latitudeDeg, target.altitudeM + 60))),
          perPositionHeight: true,
          material: Color.fromCssColorString("#fa8c16").withAlpha(0.22),
          outline: true,
          outlineColor: Color.fromCssColorString("#faad14"),
        } : undefined,
        label: {
          text: target.name,
          font: "13px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cartesian2(0, -22),
        },
      });
      entity.show = displaySettings.showTargets;
      targetEntitiesRef.current.set(target.id, entity);
    }
  }, [displaySettings.showTargets, paths, targets]);

  useEffect(() => {
    for (const state of targetStates) {
      const entity = targetEntitiesRef.current.get(state.target.id);
      if (!entity?.point) continue;
      entity.point.color = new ConstantProperty(
        state.observation.insideFootprint
          ? Color.fromCssColorString("#52c41a")
          : state.observation.visibleAboveHorizon
            ? Color.fromCssColorString("#fa8c16")
            : Color.fromCssColorString("#8c8c8c"),
      );
      if (entity.polygon) {
        const color = state.observation.insideFootprint
          ? Color.fromCssColorString("#52c41a")
          : state.observation.visibleAboveHorizon
            ? Color.fromCssColorString("#fa8c16")
            : Color.fromCssColorString("#8c8c8c");
        entity.polygon.material = new ColorMaterialProperty(color.withAlpha(0.22));
        entity.polygon.outlineColor = new ConstantProperty(color.withAlpha(0.9));
      }
    }
  }, [targetStates]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (historyDisplayMode === "union") {
      for (const entity of historyEntitiesRef.current.values()) viewer.entities.remove(entity);
      historyEntitiesRef.current.clear();
      return;
    }
    const activeKeys = new Set(coverageHistory.flatMap((sample) =>
      (sample.beamFootprints?.length ? sample.beamFootprints : [{ beamId: "primary" }])
        .map((beam) => `${sample.timeSeconds}:${beam.beamId}`),
    ));
    for (const [key, entity] of historyEntitiesRef.current) {
      if (!activeKeys.has(key)) {
        viewer.entities.remove(entity);
        historyEntitiesRef.current.delete(key);
      }
    }
    for (const sample of coverageHistory) {
      const footprints = sample.beamFootprints?.length
        ? sample.beamFootprints
        : [{ beamId: "primary", beamName: "主波束", color: "#36cfc9", verticesEcefM: sample.verticesEcefM }];
      for (const footprint of footprints) {
        const key = `${sample.timeSeconds}:${footprint.beamId}`;
        if (historyEntitiesRef.current.has(key)) continue;
        const entity = viewer.entities.add({
          name: `${footprint.beamName} 历史覆盖 T+${sample.timeSeconds.toFixed(1)}s`,
          polygon: {
            hierarchy: new PolygonHierarchy(
              footprint.verticesEcefM.map((point) => Cartesian3.fromElements(...point)),
            ),
            perPositionHeight: true,
            material: Color.fromCssColorString(footprint.color).withAlpha(0.085),
            outline: false,
          },
        });
        entity.show = displaySettings.showHistory;
        historyEntitiesRef.current.set(key, entity);
      }
    }
  }, [coverageHistory, displaySettings.showHistory, historyDisplayMode, paths]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const entity of unionEntitiesRef.current) viewer.entities.remove(entity);
    unionEntitiesRef.current = [];
    if (historyDisplayMode !== "union") return;
    const toPositions = (ring: Array<[number, number]>) => ring.map(([longitudeDeg, latitudeDeg]) =>
      Cartesian3.fromDegrees(longitudeDeg, latitudeDeg, 80),
    );
    for (const [polygonIndex, polygon] of coverageUnion.entries()) {
      if (polygon.length === 0 || polygon[0].length < 4) continue;
      const hierarchy = new PolygonHierarchy(
        toPositions(polygon[0]),
        polygon.slice(1).filter((ring) => ring.length >= 4).map((ring) => new PolygonHierarchy(toPositions(ring))),
      );
      const entity = viewer.entities.add({
        name: `累计覆盖几何并集 ${polygonIndex + 1}`,
        polygon: {
          hierarchy,
          perPositionHeight: true,
          material: Color.fromCssColorString("#13c2c2").withAlpha(0.18),
          outline: true,
          outlineColor: Color.fromCssColorString("#5cdbd3").withAlpha(0.8),
        },
      });
      entity.show = displaySettings.showHistory;
      unionEntitiesRef.current.push(entity);
    }
  }, [coverageUnion, displaySettings.showHistory, historyDisplayMode, paths]);

  return (
    <>
      <div ref={containerRef} className="globe-viewer" />
      {orbitPathState.loading && <div className="viewer-task-status">后台采样轨道…</div>}
      {companionPathState.loading && <div className="viewer-task-status">后台采样伴飞星轨道…</div>}
      {Object.keys(companionPathState.errors).length > 0 && <div className="viewer-task-status error">伴飞星轨道采样失败：{Object.values(companionPathState.errors).join("；")}</div>}
      {companionScenes.some((item) => "error" in item) && <div className="viewer-task-status error">伴飞星几何失败：{companionScenes.filter((item) => "error" in item).map((item) => "error" in item ? `${item.item.name}: ${item.error}` : "").join("；")}</div>}
      {orbitPathState.error && (
        <div className="viewer-task-status error">轨道采样失败：{orbitPathState.error}</div>
      )}
      {viewerError && <div className="viewer-task-status error">{viewerError}</div>}
      {hoverInfo && (
        <div
          className="viewer-hover-card"
          style={{
            left: Math.min(hoverInfo.x + 14, (containerRef.current?.clientWidth ?? 320) - 294),
            top: Math.min(hoverInfo.y + 14, (containerRef.current?.clientHeight ?? 240) - 120),
          }}
        >
          <strong>{hoverInfo.title}</strong>
          {hoverInfo.lines.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
    </>
  );
}

import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  Ellipsoid,
  JulianDate,
  Matrix3,
  PolygonHierarchy,
  Quaternion,
} from "cesium";
import type { SceneGeometry } from "../simulation/sceneGeometry";
import type { AntennaConfig, CircularOrbitConfig, DisplaySettings } from "../stores/simulationStore";

export interface LiveSceneFrame {
  satellite: SceneGeometry["satellite"];
  attitude: SceneGeometry["attitude"];
  coverage: SceneGeometry["coverage"];
  beams: SceneGeometry["beams"];
  antenna: AntennaConfig;
  displaySettings: DisplaySettings;
  orbit: CircularOrbitConfig;
}

/** Dynamic Cesium property. isConstant=false samples the getter on every scene render. */
export function liveProperty<T>(getValue: () => T): CallbackProperty {
  return new CallbackProperty(() => getValue(), false);
}

export function liveCartesianPosition(getValue: () => Cartesian3): CallbackPositionProperty {
  return new CallbackPositionProperty((_time?: JulianDate, result?: Cartesian3) => (
    Cartesian3.clone(getValue(), result ?? new Cartesian3())
  ), false);
}

export function liveEcefPosition(getEcef: () => readonly number[]): CallbackPositionProperty {
  return new CallbackPositionProperty((_time?: JulianDate, result?: Cartesian3) => {
    const point = getEcef();
    return Cartesian3.fromElements(point[0], point[1], point[2], result ?? new Cartesian3());
  }, false);
}

export function liveBodyOrientation(
  getAxes: () => readonly (readonly [number, number, number])[],
): CallbackProperty {
  return new CallbackProperty((_time?: JulianDate, result?: Quaternion) => {
    const [bodyX, bodyY, bodyZ] = getAxes();
    return Quaternion.fromRotationMatrix(
      Matrix3.fromArray([
        ...bodyX,
        ...bodyY,
        ...bodyZ,
      ]),
      result ?? new Quaternion(),
    );
  }, false);
}

export function liveOffsetEcefPosition(
  getOriginEcef: () => readonly number[],
  getDirection: () => readonly [number, number, number],
  getLengthM: () => number,
): CallbackPositionProperty {
  const scratchOrigin = new Cartesian3();
  const scratchDirection = new Cartesian3();
  const scratchOffset = new Cartesian3();
  return new CallbackPositionProperty((_time?: JulianDate, result?: Cartesian3) => {
    const origin = getOriginEcef();
    const direction = getDirection();
    Cartesian3.fromElements(origin[0], origin[1], origin[2], scratchOrigin);
    Cartesian3.fromElements(direction[0], direction[1], direction[2], scratchDirection);
    Cartesian3.multiplyByScalar(scratchDirection, getLengthM(), scratchOffset);
    return Cartesian3.add(scratchOrigin, scratchOffset, result ?? new Cartesian3());
  }, false);
}

export function liveGeodeticPosition(
  getLongitudeDeg: () => number,
  getLatitudeDeg: () => number,
  heightM: number,
): CallbackPositionProperty {
  return new CallbackPositionProperty((_time?: JulianDate, result?: Cartesian3) => (
    Cartesian3.fromDegrees(
      getLongitudeDeg(),
      getLatitudeDeg(),
      heightM,
      Ellipsoid.WGS84,
      result ?? new Cartesian3(),
    )
  ), false);
}

export function livePolygonHierarchy(getPointsEcef: () => Array<readonly number[]>): CallbackProperty {
  return liveProperty(() => new PolygonHierarchy(
    getPointsEcef().map((point) => Cartesian3.fromElements(point[0], point[1], point[2])),
  ));
}

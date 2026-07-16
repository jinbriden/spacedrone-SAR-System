import {
  DEG_TO_RAD,
  evaluateGroundTarget,
  evaluateTerrainLineOfSight,
  geodeticToEcef,
  geodeticRegionsIntersect,
  RAD_TO_DEG,
} from "@spacedrone/orbital-core";
import type { GroundTargetConfig, TerrainConfig } from "../stores/simulationStore";
import type { SceneGeometry } from "./sceneGeometry";
import { targetRegionBoundary } from "./targetRegion";

export function computeTargetObservations(
  scene: SceneGeometry,
  targets: readonly GroundTargetConfig[],
  terrain?: TerrainConfig,
) {
  return targets.map((target) => {
    const targetEcefM = geodeticToEcef({
      longitudeRad: target.longitudeDeg * DEG_TO_RAD,
      latitudeRad: target.latitudeDeg * DEG_TO_RAD,
      altitudeM: target.altitudeM,
    });
    const evaluateForBeam = (beam: SceneGeometry["beams"][number], pointEcefM: typeof targetEcefM) =>
      evaluateGroundTarget({
        targetEcefM: pointEcefM,
        satelliteEcefM: scene.satellite.positionEcefM,
        footprint: beam,
        alongTrackAxisEcef: scene.attitude.lvlhAxesEcef[0],
        crossTrackAxisEcef: scene.attitude.lvlhAxesEcef[1],
        ecefFromAntenna: scene.attitude.ecefFromAntenna,
        steeringAzimuthRad: beam.effectiveSteering.azimuthRad,
        steeringElevationRad: beam.effectiveSteering.elevationRad,
      });
    const beamObservations = scene.beams.map((beam) => ({
      beam,
      observation: evaluateForBeam(beam, targetEcefM),
    }));
    const selectedBeamState = beamObservations.find((state) => state.observation.insideFootprint)
      ?? beamObservations.reduce((best, candidate) =>
        Math.hypot(candidate.observation.azimuthDeviationRad, candidate.observation.elevationDeviationRad)
          < Math.hypot(best.observation.azimuthDeviationRad, best.observation.elevationDeviationRad)
          ? candidate
          : best,
      );
    const observation = { ...selectedBeamState.observation };
    let illuminatingBeamIds = beamObservations
      .filter((state) => state.observation.insideFootprint)
      .map((state) => state.beam.id);
    const terrainLineOfSight = terrain?.enabled && terrain.grid && terrain.lineOfSightEnabled
      ? evaluateTerrainLineOfSight(
          scene.satellite.positionEcefM,
          targetEcefM,
          terrain.grid,
          terrain.lineOfSightSampleSpacingM,
          terrain.lineOfSightClearanceM,
        )
      : undefined;
    let terrainOccluded = terrainLineOfSight ? !terrainLineOfSight.clear : false;
    if (terrainOccluded) {
      observation.visibleAboveHorizon = false;
      observation.insideFootprint = false;
    }
    const regionBoundary = targetRegionBoundary(target);
    const regionBoundaryEcefM = regionBoundary?.map((point) => geodeticToEcef({
      longitudeRad: point.longitudeDeg * DEG_TO_RAD,
      latitudeRad: point.latitudeDeg * DEG_TO_RAD,
      altitudeM: target.altitudeM,
    }));
    if (regionBoundary && regionBoundaryEcefM) {
      const intersectingBeams = scene.beams.filter((beam) => {
        if (!beam.isClosed) return false;
        const footprintBoundary = beam.vertices.map((vertex) => ({
          longitudeDeg: vertex.geodetic.longitudeRad * RAD_TO_DEG,
          latitudeDeg: vertex.geodetic.latitudeRad * RAD_TO_DEG,
        }));
        return geodeticRegionsIntersect(regionBoundary, footprintBoundary);
      });
      let anyBoundaryVisible = observation.visibleAboveHorizon;
      for (const boundaryPointEcefM of regionBoundaryEcefM) {
        if (anyBoundaryVisible) break;
        const boundaryObservation = evaluateForBeam(selectedBeamState.beam, boundaryPointEcefM);
        const boundaryLineOfSight = terrain?.enabled && terrain.grid && terrain.lineOfSightEnabled
          ? evaluateTerrainLineOfSight(
              scene.satellite.positionEcefM,
              boundaryPointEcefM,
              terrain.grid,
              terrain.lineOfSightSampleSpacingM,
              terrain.lineOfSightClearanceM,
            )
          : undefined;
        anyBoundaryVisible = boundaryObservation.visibleAboveHorizon && (boundaryLineOfSight?.clear ?? true);
      }
      observation.visibleAboveHorizon = anyBoundaryVisible;
      observation.insideFootprint = anyBoundaryVisible && intersectingBeams.length > 0;
      illuminatingBeamIds = observation.insideFootprint ? intersectingBeams.map((beam) => beam.id) : [];
      if (anyBoundaryVisible) terrainOccluded = false;
    } else if (terrainOccluded) {
      illuminatingBeamIds = [];
    }
    return {
      target,
      targetEcefM,
      regionBoundary,
      regionBoundaryEcefM,
      observation,
      beamObservations,
      selectedBeamId: selectedBeamState.beam.id,
      selectedBeamName: selectedBeamState.beam.name,
      illuminatingBeamIds,
      terrainLineOfSight,
      terrainOccluded,
    };
  });
}

import { useEffect, useRef } from "react";
import { computeSceneGeometry } from "../simulation/sceneGeometry";
import { computeTargetObservations } from "../simulation/targetObservation";
import { useSimulationStore } from "../stores/simulationStore";

interface SamplerCursor {
  sceneRevision: number;
  configSignature: string;
  targetSignature: string;
  historySettingsSignature: string;
  nextTargetSeconds: number;
  nextHistorySeconds: number;
  lastElapsedSeconds: number;
}

export function useMissionSampler(): void {
  const orbit = useSimulationStore((state) => state.orbit);
  const attitude = useSimulationStore((state) => state.attitude);
  const antenna = useSimulationStore((state) => state.antenna);
  const targets = useSimulationStore((state) => state.targets);
  const terrain = useSimulationStore((state) => state.terrain);
  const elapsedSeconds = useSimulationStore((state) => state.elapsedSeconds);
  const settings = useSimulationStore((state) => state.missionSettings);
  const sceneRevision = useSimulationStore((state) => state.sceneRevision);
  const processMissionSamples = useSimulationStore(
    (state) => state.processMissionSamples,
  );
  const resetMissionData = useSimulationStore((state) => state.resetMissionData);
  const clearCoverageHistory = useSimulationStore(
    (state) => state.clearCoverageHistory,
  );
  const cursorRef = useRef<SamplerCursor | undefined>(undefined);

  useEffect(() => {
    const configSignature = JSON.stringify({ orbit, attitude, antenna, terrain });
    const targetSignature = targets.map((target) => target.id).join("|");
    const historySettingsSignature = JSON.stringify({
      enabled: settings.historyEnabled,
      interval: settings.historySampleIntervalSeconds,
      maximum: settings.maxHistoryFootprints,
    });
    let cursor = cursorRef.current;
    const sceneChanged = cursor?.configSignature !== configSignature;
    const timeReversed =
      cursor !== undefined && elapsedSeconds < cursor.lastElapsedSeconds - 1e-9;
    const historySettingsChanged =
      cursor?.historySettingsSignature !== historySettingsSignature;
    const sceneRestored = cursor !== undefined && cursor.sceneRevision !== sceneRevision;

    if (sceneRestored) {
      const latestTargetSample = Math.max(
        -Infinity,
        ...Object.values(useSimulationStore.getState().targetPasses)
          .map((pass) => pass.lastSampleSeconds ?? -Infinity),
      );
      const history = useSimulationStore.getState().coverageHistory;
      const latestHistorySample = history.at(-1)?.timeSeconds ?? -Infinity;
      cursor = {
        sceneRevision,
        configSignature,
        targetSignature,
        historySettingsSignature,
        nextTargetSeconds: Number.isFinite(latestTargetSample)
          ? latestTargetSample + settings.targetSampleStepSeconds
          : elapsedSeconds,
        nextHistorySeconds: Number.isFinite(latestHistorySample)
          ? latestHistorySample + settings.historySampleIntervalSeconds
          : elapsedSeconds,
        lastElapsedSeconds: elapsedSeconds,
      };
      cursorRef.current = cursor;
    } else if (!cursor || sceneChanged || timeReversed) {
      resetMissionData();
      cursor = {
        sceneRevision,
        configSignature,
        targetSignature,
        historySettingsSignature,
        nextTargetSeconds: elapsedSeconds,
        nextHistorySeconds: elapsedSeconds,
        lastElapsedSeconds: elapsedSeconds,
      };
      cursorRef.current = cursor;
    } else if (historySettingsChanged) {
      clearCoverageHistory();
      cursor.historySettingsSignature = historySettingsSignature;
      cursor.nextHistorySeconds = elapsedSeconds;
    } else if (cursor.targetSignature !== targetSignature) {
      cursor.targetSignature = targetSignature;
      cursor.nextTargetSeconds = elapsedSeconds;
    }

    const samples: Array<{
      timeSeconds: number;
      targetInsideById: Record<string, boolean>;
      footprintVerticesEcefM?: ReturnType<typeof computeSceneGeometry>["coverage"]["vertices"][number]["pointEcefM"][];
      beamFootprints?: NonNullable<Parameters<typeof processMissionSamples>[0][number]["beamFootprints"]>;
    }> = [];
    const epsilon = 1e-9;
    while (true) {
      const targetTime =
        targets.length > 0 ? cursor.nextTargetSeconds : Number.POSITIVE_INFINITY;
      const historyTime = settings.historyEnabled
        ? cursor.nextHistorySeconds
        : Number.POSITIVE_INFINITY;
      const sampleTime = Math.min(targetTime, historyTime);
      if (!Number.isFinite(sampleTime) || sampleTime > elapsedSeconds + epsilon) break;

      const scene = computeSceneGeometry({ orbit, attitude, antenna, targets, terrain, elapsedSeconds: sampleTime });
      const targetInsideById: Record<string, boolean> = {};
      if (Math.abs(sampleTime - targetTime) <= epsilon) {
        for (const state of computeTargetObservations(scene, targets, terrain)) {
          targetInsideById[state.target.id] = state.observation.insideFootprint;
        }
        cursor.nextTargetSeconds += settings.targetSampleStepSeconds;
      }
      const includeHistory = Math.abs(sampleTime - historyTime) <= epsilon;
      if (includeHistory) {
        cursor.nextHistorySeconds += settings.historySampleIntervalSeconds;
      }
      samples.push({
        timeSeconds: sampleTime,
        targetInsideById,
        footprintVerticesEcefM:
          includeHistory && scene.coverage.isClosed
            ? scene.coverage.vertices.map((vertex) => vertex.pointEcefM)
            : undefined,
        beamFootprints: includeHistory
          ? scene.beams.filter((beam) => beam.isClosed).map((beam) => ({
              beamId: beam.id,
              beamName: beam.name,
              color: beam.color,
              verticesEcefM: beam.vertices.map((vertex) => vertex.pointEcefM),
            }))
          : undefined,
      });
    }
    cursor.lastElapsedSeconds = elapsedSeconds;
    processMissionSamples(samples);
  }, [
    antenna,
    attitude,
    clearCoverageHistory,
    elapsedSeconds,
    orbit,
    processMissionSamples,
    resetMissionData,
    sceneRevision,
    settings,
    targets,
    terrain,
  ]);
}

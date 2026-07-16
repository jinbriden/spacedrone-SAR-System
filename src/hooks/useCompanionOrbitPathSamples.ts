import { useEffect, useState } from "react";
import type { CompanionSatelliteConfig } from "../stores/simulationStore";
import type { SimulationSamplingResult } from "../workers/simulationSampling";
import { runSimulationSamplingWorker } from "../workers/simulationWorkerClient";

export interface CompanionOrbitPathState {
  results: Record<string, SimulationSamplingResult>;
  errors: Record<string, string>;
  loading: boolean;
}

export function useCompanionOrbitPathSamples(satellites: readonly CompanionSatelliteConfig[]): CompanionOrbitPathState {
  const [state, setState] = useState<CompanionOrbitPathState>({ results: {}, errors: {}, loading: false });
  useEffect(() => {
    let active = true;
    const enabled = satellites.filter((satellite) => satellite.enabled);
    if (enabled.length === 0) { setState({ results: {}, errors: {}, loading: false }); return; }
    setState({ results: {}, errors: {}, loading: true });
    void Promise.all(enabled.map(async (satellite) => {
      try {
        return { id: satellite.id, ok: true as const, result: await runSimulationSamplingWorker({ orbit: satellite.orbit, sampleCount: 721 }) };
      } catch (error) {
        return { id: satellite.id, ok: false as const, error: error instanceof Error ? error.message : "轨道后台采样失败。" };
      }
    })).then((items) => {
      if (!active) return;
      const results: Record<string, SimulationSamplingResult> = {};
      const errors: Record<string, string> = {};
      for (const item of items) {
        if (item.ok) results[item.id] = item.result;
        else errors[item.id] = item.error;
      }
      setState({ results, errors, loading: false });
    });
    return () => { active = false; };
  }, [satellites]);
  return state;
}

import { useEffect, useState } from "react";
import type { CircularOrbitConfig } from "../stores/simulationStore";
import type { SimulationSamplingResult } from "../workers/simulationSampling";
import { runSimulationSamplingWorker } from "../workers/simulationWorkerClient";

interface OrbitPathState {
  result?: SimulationSamplingResult;
  loading: boolean;
  error?: string;
}

export function useOrbitPathSamples(orbit: CircularOrbitConfig): OrbitPathState {
  const [state, setState] = useState<OrbitPathState>({ loading: true });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    runSimulationSamplingWorker({ orbit, sampleCount: 721 })
      .then((result) => {
        if (active) setState({ result, loading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : "轨道后台采样失败。",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [orbit]);
  return state;
}

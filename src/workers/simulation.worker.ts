/// <reference lib="webworker" />
import {
  computeSimulationSamples,
  type SimulationSamplingRequest,
} from "./simulationSampling";

interface WorkerRequest {
  id: number;
  request: SimulationSamplingRequest;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, result: computeSimulationSamples(request) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "后台计算失败。",
    });
  }
};

export {};

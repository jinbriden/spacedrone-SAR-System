import type {
  SimulationSamplingRequest,
  SimulationSamplingResult,
} from "./simulationSampling";

let nextRequestId = 1;

/** Runs a bounded sampling job outside the UI thread. */
export function runSimulationSamplingWorker(
  request: SimulationSamplingRequest,
): Promise<SimulationSamplingResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
      type: "module",
      name: "spacedrone-simulation-sampler",
    });
    const cleanup = () => worker.terminate();
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "无法启动仿真计算 Worker。"));
    };
    worker.onmessage = (event: MessageEvent<{
      id: number;
      result?: SimulationSamplingResult;
      error?: string;
    }>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("Worker 返回了无效结果。"));
    };
    worker.postMessage({ id, request });
  });
}

import type { SarAnalysisRequest } from "./sarAnalysis";
import type { SarEchoResult } from "./sarEcho";

let nextRequestId = 1;

export function runSarEchoWorker(request: SarAnalysisRequest): Promise<SarEchoResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const worker = new Worker(new URL("./sarEcho.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: SarEchoResult; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("SAR 回波 Worker 返回了空结果。"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "SAR 回波 Worker 执行失败。"));
    };
    worker.postMessage({ id, request });
  });
}

import type { SarAnalysisRequest } from "./sarAnalysis";
import type { SarImagingResult } from "./sarImaging";

let nextRequestId = 1;

export function runSarImagingWorker(request: SarAnalysisRequest): Promise<SarImagingResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const worker = new Worker(new URL("./sarImaging.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: SarImagingResult; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("SAR 成像 Worker 返回了空结果。"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "SAR 成像 Worker 执行失败。"));
    };
    worker.postMessage({ id, request });
  });
}

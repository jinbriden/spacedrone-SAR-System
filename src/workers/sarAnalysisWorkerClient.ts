import type { SarAnalysisRequest, SarAnalysisResult } from "./sarAnalysis";

let nextRequestId = 1;

export function runSarAnalysisWorker(request: SarAnalysisRequest): Promise<SarAnalysisResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const worker = new Worker(new URL("./sarAnalysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: SarAnalysisResult; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("SAR Worker 返回了空结果。"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "SAR Worker 执行失败。"));
    };
    worker.postMessage({ id, request });
  });
}

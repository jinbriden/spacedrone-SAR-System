import type { SarAnalysisRequest } from "./sarAnalysis";
import type { SarDbfAnalysisResult } from "./sarDbf";

let nextRequestId = 1;

export function runSarDbfWorker(request: SarAnalysisRequest): Promise<SarDbfAnalysisResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    const worker = new Worker(new URL("./sarDbf.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: SarDbfAnalysisResult; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("SAR DBF Worker 返回了空结果。"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "SAR DBF Worker 执行失败。"));
    };
    worker.postMessage({ id, request });
  });
}

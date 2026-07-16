import type { RevisitAnalysisRequest, RevisitAnalysisResult } from "./revisitAnalysis";

let nextRevisitRequestId = 1;

/** Runs a bounded target revisit-analysis job outside the UI thread. */
export function runRevisitAnalysisWorker(request: RevisitAnalysisRequest): Promise<RevisitAnalysisResult> {
  return new Promise((resolve, reject) => {
    const id = nextRevisitRequestId++;
    const worker = new Worker(new URL("./revisit.worker.ts", import.meta.url), { type: "module", name: "spacedrone-revisit-analysis" });
    const cleanup = () => worker.terminate();
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "无法启动重访分析 Worker。")); };
    worker.onmessage = (event: MessageEvent<{ id: number; result?: RevisitAnalysisResult; error?: string }>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error("重访分析 Worker 返回了无效结果。"));
    };
    worker.postMessage({ id, request });
  });
}

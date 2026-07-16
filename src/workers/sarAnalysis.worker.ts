/// <reference lib="webworker" />
import { computeSarAnalysis, type SarAnalysisRequest } from "./sarAnalysis";

interface WorkerRequest { id: number; request: SarAnalysisRequest }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try { self.postMessage({ id, result: computeSarAnalysis(request) }); }
  catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : "SAR 分析失败。" }); }
};

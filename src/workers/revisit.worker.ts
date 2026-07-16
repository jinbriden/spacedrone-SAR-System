/// <reference lib="webworker" />
import { computeRevisitAnalysis, type RevisitAnalysisRequest } from "./revisitAnalysis";

interface WorkerRequest { id: number; request: RevisitAnalysisRequest }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    self.postMessage({ id, result: computeRevisitAnalysis(request) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "重访分析失败。" });
  }
};

export {};

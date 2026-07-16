/// <reference lib="webworker" />
import { computeSarEcho } from "./sarEcho";
import type { SarAnalysisRequest } from "./sarAnalysis";

interface WorkerRequest { id: number; request: SarAnalysisRequest }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = computeSarEcho(request);
    self.postMessage({ id, result }, [result.echo.inPhase.buffer, result.echo.quadrature.buffer, result.echo.slowTimeSeconds.buffer, result.selectedSlantRangeM.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "SAR 回波生成失败。" });
  }
};

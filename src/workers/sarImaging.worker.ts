/// <reference lib="webworker" />
import type { SarAnalysisRequest } from "./sarAnalysis";
import { computeSarImaging } from "./sarImaging";

interface WorkerRequest { id: number; request: SarAnalysisRequest }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = computeSarImaging(request);
    self.postMessage({ id, result }, [
      result.image.intensityDb.buffer,
      result.image.azimuthTimeOffsetSeconds.buffer,
      result.image.apparentRangeM.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "SAR 成像失败。" });
  }
};

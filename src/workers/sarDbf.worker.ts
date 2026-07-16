/// <reference lib="webworker" />
import type { SarAnalysisRequest } from "./sarAnalysis";
import { computeSarDbfAnalysis } from "./sarDbf";

interface WorkerRequest { id: number; request: SarAnalysisRequest }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = computeSarDbfAnalysis(request);
    const echo = result.multiChannelEcho;
    self.postMessage({ id, result }, [
      echo.channelOffsetsM.buffer, echo.slowTimeSeconds.buffer, echo.inPhase.buffer, echo.quadrature.buffer,
      result.dbf.weightReal.buffer, result.dbf.weightImag.buffer, result.dbf.inPhase.buffer, result.dbf.quadrature.buffer,
      result.spectrum.frequencyHz.buffer, result.spectrum.magnitude.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "SAR DBF 分析失败。" });
  }
};

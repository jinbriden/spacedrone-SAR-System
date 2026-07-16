import { runSarImagingAlgorithm, type DerivedSarSystemParameters, type SarFocusedImage } from "@spacedrone/orbital-core";
import type { SarAnalysisRequest } from "./sarAnalysis";
import { computeSarEcho } from "./sarEcho";

export interface SarImagingResult {
  targetId: string;
  targetName: string;
  system: DerivedSarSystemParameters;
  selectedPulseStartSeconds: number;
  selectedPulseEndSeconds: number;
  image: SarFocusedImage;
}

export function computeSarImaging(request: SarAnalysisRequest): SarImagingResult {
  if (request.config.echoPulseCount > 256) throw new RangeError("参考成像流程最多使用 256 个回波脉冲，请减小回波连续脉冲数。");
  const echoResult = computeSarEcho(request);
  const image = runSarImagingAlgorithm(request.config.imagingAlgorithmId, {
    pulseCount: echoResult.echo.pulseCount,
    fastTimeSampleCount: echoResult.echo.fastTimeSampleCount,
    fastTimeStartSeconds: echoResult.echo.fastTimeStartSeconds,
    fastTimeStepSeconds: echoResult.echo.fastTimeStepSeconds,
    referenceFastTimeIndex: echoResult.echo.referenceFastTimeIndex,
    inPhase: echoResult.echo.inPhase,
    quadrature: echoResult.echo.quadrature,
    slantRangeM: echoResult.selectedSlantRangeM,
    system: echoResult.system,
    maximumRangePixels: request.config.imagingMaximumRangePixels,
  });
  return {
    targetId: request.target.id,
    targetName: request.target.name,
    system: echoResult.system,
    selectedPulseStartSeconds: echoResult.selectedPulseStartSeconds,
    selectedPulseEndSeconds: echoResult.selectedPulseEndSeconds,
    image,
  };
}

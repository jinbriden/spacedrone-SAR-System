import { generateSarPointTargetEcho, type DerivedSarSystemParameters, type SarRawEcho } from "@spacedrone/orbital-core";
import type { SarAnalysisRequest } from "./sarAnalysis";
import { computeSarAnalysis } from "./sarAnalysis";

export interface SarEchoResult {
  targetId: string;
  targetName: string;
  system: DerivedSarSystemParameters;
  selectedPulseStartSeconds: number;
  selectedPulseEndSeconds: number;
  selectedSlantRangeM: Float64Array;
  echo: SarRawEcho;
}

/** Generates a bounded consecutive PRF block centered on closest approach. */
export function computeSarEcho(request: SarAnalysisRequest): SarEchoResult {
  const analysis = computeSarAnalysis(request);
  const allSamples = analysis.history.samples;
  const requestedCount = Math.min(request.config.echoPulseCount, allSamples.length);
  const closestIndex = allSamples.indexOf(analysis.history.closestApproach);
  const startIndex = Math.max(0, Math.min(
    allSamples.length - requestedCount,
    closestIndex - Math.floor(requestedCount / 2),
  ));
  const selected = allSamples.slice(startIndex, startIndex + requestedCount);
  const echo = generateSarPointTargetEcho(selected, analysis.system, {
    targetRcsM2: request.config.targetRcsM2,
    noiseStandardDeviation: request.config.noiseStandardDeviation,
    randomSeed: request.config.randomSeed,
    foldRangeAmbiguity: request.config.foldRangeAmbiguity,
    maximumComplexSamples: 5_000_000,
  });
  return {
    targetId: request.target.id,
    targetName: request.target.name,
    system: analysis.system,
    selectedPulseStartSeconds: selected[0].slowTimeSeconds,
    selectedPulseEndSeconds: selected.at(-1)!.slowTimeSeconds,
    selectedSlantRangeM: Float64Array.from(selected.map((sample) => sample.slantRangeM)),
    echo,
  };
}

import {
  formSarDbfEcho,
  generateSarMultiChannelEcho,
  reconstructSarAzimuthSpectrum,
  type DerivedSarSystemParameters,
  type SarDbfResult,
  type SarMultiChannelEcho,
  type SarReconstructedSpectrum,
} from "@spacedrone/orbital-core";
import type { SarAnalysisRequest } from "./sarAnalysis";
import { computeSarAnalysis } from "./sarAnalysis";

export interface SarDbfAnalysisResult {
  targetId: string;
  targetName: string;
  system: DerivedSarSystemParameters;
  selectedPulseStartSeconds: number;
  selectedPulseEndSeconds: number;
  multiChannelEcho: SarMultiChannelEcho;
  dbf: SarDbfResult;
  spectrum: SarReconstructedSpectrum;
}

export function computeSarDbfAnalysis(request: SarAnalysisRequest): SarDbfAnalysisResult {
  const analysis = computeSarAnalysis(request);
  const allSamples = analysis.history.samples;
  const requestedCount = Math.min(request.config.multiChannelPulseCount, allSamples.length, 512);
  const closestIndex = allSamples.indexOf(analysis.history.closestApproach);
  const startIndex = Math.max(0, Math.min(allSamples.length - requestedCount, closestIndex - Math.floor(requestedCount / 2)));
  const selected = allSamples.slice(startIndex, startIndex + requestedCount);
  const multiChannelEcho = generateSarMultiChannelEcho(selected, analysis.system, {
    channelCount: request.config.receiveChannelCount,
    alongTrackSpacingM: request.config.receiveChannelSpacingM,
    targetRcsM2: request.config.targetRcsM2,
    noiseStandardDeviation: request.config.noiseStandardDeviation,
    randomSeed: request.config.randomSeed,
    foldRangeAmbiguity: request.config.foldRangeAmbiguity,
    maximumComplexSamples: 5_000_000,
  });
  const dbf = formSarDbfEcho(multiChannelEcho, request.config.dbfSteeringDopplerHz);
  const spectrum = reconstructSarAzimuthSpectrum(multiChannelEcho, analysis.system.prfHz);
  return {
    targetId: request.target.id,
    targetName: request.target.name,
    system: analysis.system,
    selectedPulseStartSeconds: selected[0].slowTimeSeconds,
    selectedPulseEndSeconds: selected.at(-1)!.slowTimeSeconds,
    multiChannelEcho,
    dbf,
    spectrum,
  };
}

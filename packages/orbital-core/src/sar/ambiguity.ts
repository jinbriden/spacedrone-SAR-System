import { SPEED_OF_LIGHT_M_S } from "../constants";
import type { SarRangeHistory, SarRangeHistorySample } from "./rangeHistory";
import type { DerivedSarSystemParameters } from "./system";

export interface SarAmbiguitySample {
  slowTimeSeconds: number;
  rangeAmbiguityOrder: number;
  foldedTwoWayDelaySeconds: number;
  apparentRangeM: number;
  azimuthAmbiguityOrder: number;
  aliasedDopplerHz: number;
}

export interface SarAmbiguityAnalysis {
  samples: SarAmbiguitySample[];
  rangeAmbiguous: boolean;
  azimuthAmbiguous: boolean;
  maximumRangeAmbiguityOrder: number;
  maximumAzimuthAmbiguityOrder: number;
  estimatedAzimuthReplicaCount: number;
}

export function analyzeSarAmbiguities(
  history: Pick<SarRangeHistory, "samples" | "dopplerBandwidthHz">,
  system: DerivedSarSystemParameters,
): SarAmbiguityAnalysis {
  const priSeconds = 1 / system.prfHz;
  const samples = history.samples.map((sample: SarRangeHistorySample) => {
    const rangeAmbiguityOrder = Math.floor(sample.twoWayDelaySeconds / priSeconds);
    const foldedTwoWayDelaySeconds = sample.twoWayDelaySeconds - rangeAmbiguityOrder * priSeconds;
    const azimuthAmbiguityOrder = Math.floor((sample.dopplerHz + system.prfHz / 2) / system.prfHz);
    let aliasedDopplerHz = sample.dopplerHz - azimuthAmbiguityOrder * system.prfHz;
    if (aliasedDopplerHz >= system.prfHz / 2) aliasedDopplerHz -= system.prfHz;
    return {
      slowTimeSeconds: sample.slowTimeSeconds,
      rangeAmbiguityOrder,
      foldedTwoWayDelaySeconds,
      apparentRangeM: foldedTwoWayDelaySeconds * SPEED_OF_LIGHT_M_S / 2,
      azimuthAmbiguityOrder,
      aliasedDopplerHz,
    };
  });
  return {
    samples,
    rangeAmbiguous: samples.some((sample) => sample.rangeAmbiguityOrder !== 0),
    azimuthAmbiguous: history.dopplerBandwidthHz > system.prfHz || samples.some((sample) => sample.azimuthAmbiguityOrder !== 0),
    maximumRangeAmbiguityOrder: Math.max(...samples.map((sample) => Math.abs(sample.rangeAmbiguityOrder))),
    maximumAzimuthAmbiguityOrder: Math.max(...samples.map((sample) => Math.abs(sample.azimuthAmbiguityOrder))),
    estimatedAzimuthReplicaCount: Math.max(1, Math.ceil(history.dopplerBandwidthHz / system.prfHz)),
  };
}

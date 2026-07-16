import type { SarAnalysisResult } from "../workers/sarAnalysis";

export function sarAnalysisToCsv(result: SarAnalysisResult): string {
  const rows = result.history.samples.map((sample) => [
    sample.slowTimeSeconds,
    sample.slantRangeM,
    sample.rangeRateMps,
    sample.twoWayDelaySeconds,
    sample.dopplerHz,
    ...sample.sensorPositionEcefM,
    ...sample.sensorVelocityEcefMps,
  ].join(","));
  return `\uFEFFslowTimeSeconds,slantRangeM,rangeRateMps,twoWayDelaySeconds,dopplerHz,sensorEcefXM,sensorEcefYM,sensorEcefZM,sensorVelocityEcefXMps,sensorVelocityEcefYMps,sensorVelocityEcefZMps\r\n${rows.join("\r\n")}\r\n`;
}

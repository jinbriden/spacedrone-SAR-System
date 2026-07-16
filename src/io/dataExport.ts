import type { SimulationSamplingResult } from "../workers/simulationSampling";

function csvCell(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function simulationSamplesToCsv(result: SimulationSamplingResult): string {
  const headers = [
    "timeSeconds", "utc", "satelliteLongitudeDeg", "satelliteLatitudeDeg",
    "positionEciXM", "positionEciYM", "positionEciZM",
    "velocityEciXMps", "velocityEciYMps", "velocityEciZMps",
    "satelliteAltitudeM", "satelliteEcefXM", "satelliteEcefYM", "satelliteEcefZM",
    "attitudeQuaternionX", "attitudeQuaternionY", "attitudeQuaternionZ", "attitudeQuaternionW",
    "beamCenterLongitudeDeg", "beamCenterLatitudeDeg", "beamCenterAltitudeM",
    "slantRangeM", "incidenceAngleDeg", "coverageAreaM2", "coverageVertexCount",
    "beamCount", "closedBeamCount", "totalBeamCoverageAreaM2",
  ];
  const rows = result.samples.map((sample) => [
    sample.timeSeconds,
    sample.utc,
    sample.satellite.longitudeDeg,
    sample.satellite.latitudeDeg,
    ...sample.positionEciM,
    ...sample.velocityEciMps,
    sample.satellite.altitudeM,
    ...sample.satellitePositionEcefM,
    ...sample.attitudeQuaternion,
    sample.beamCenter?.longitudeDeg,
    sample.beamCenter?.latitudeDeg,
    sample.beamCenter?.altitudeM,
    sample.slantRangeM,
    sample.incidenceAngleDeg,
    sample.coverageAreaM2,
    sample.coverageVertices?.length ?? 0,
    sample.beams?.length ?? (sample.coverageVertices ? 1 : 0),
    sample.beams?.filter((beam) => beam.vertices && beam.vertices.length >= 3).length ?? (sample.coverageVertices ? 1 : 0),
    sample.beams?.reduce((sum, beam) => sum + (beam.localProjectedAreaM2 ?? 0), 0) ?? sample.coverageAreaM2,
  ].map(csvCell).join(","));
  return `\uFEFF${headers.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export function simulationSamplesToGeoJson(result: SimulationSamplingResult): string {
  const orbitCoordinates = result.samples.map((sample) => [
    sample.satellite.longitudeDeg,
    sample.satellite.latitudeDeg,
    sample.satellite.altitudeM,
  ]);
  const beamCoordinates = result.samples
    .filter((sample) => sample.beamCenter)
    .map((sample) => [
      sample.beamCenter!.longitudeDeg,
      sample.beamCenter!.latitudeDeg,
      sample.beamCenter!.altitudeM,
    ]);
  const features: Array<Record<string, unknown>> = [
    {
      type: "Feature",
      properties: { name: "satellite-ground-track", sampleCount: result.samples.length },
      geometry: { type: "LineString", coordinates: orbitCoordinates },
    },
  ];
  if (beamCoordinates.length >= 2) {
    features.push({
      type: "Feature",
      properties: { name: "beam-center-track", sampleCount: beamCoordinates.length },
      geometry: { type: "LineString", coordinates: beamCoordinates },
    });
  }
  for (const sample of result.samples) {
    const beams = sample.beams ?? (sample.coverageVertices ? [{
      beamId: "primary", beamName: "主波束", color: "#fadb14", relativePowerDb: 0,
      vertices: sample.coverageVertices, localProjectedAreaM2: sample.coverageAreaM2,
      slantRangeM: sample.slantRangeM, incidenceAngleDeg: sample.incidenceAngleDeg,
    }] : []);
    for (const beam of beams) {
      if (!beam.vertices || beam.vertices.length < 3) continue;
      const ring = beam.vertices.map((point) => [point.longitudeDeg, point.latitudeDeg, point.altitudeM]);
      ring.push([...ring[0]]);
      features.push({
        type: "Feature",
        properties: {
          name: "beam-footprint",
          beamId: beam.beamId,
          beamName: beam.beamName,
          color: beam.color,
          relativePowerDb: beam.relativePowerDb,
          timeSeconds: sample.timeSeconds,
          utc: sample.utc,
          localProjectedAreaM2: beam.localProjectedAreaM2,
          slantRangeM: beam.slantRangeM,
          incidenceAngleDeg: beam.incidenceAngleDeg,
        },
        geometry: { type: "Polygon", coordinates: [ring] },
      });
    }
  }
  return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

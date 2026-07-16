import { describe, expect, it } from "vitest";
import { parseTleMetadata, TleSgp4OrbitPropagator } from "./tleSgp4Orbit";

const LINE1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753";
const LINE2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667";

function replaceChecksum(line: string): string {
  const body = line.slice(0, 68);
  let checksum = 0;
  for (const character of body) {
    if (character >= "0" && character <= "9") checksum += Number(character);
    else if (character === "-") checksum += 1;
  }
  return `${body}${checksum % 10}`;
}

describe("TLE SGP4 orbit propagator", () => {
  it("parses Vanguard 1 verification TLE metadata and Vallado epoch state", () => {
    const metadata = parseTleMetadata(LINE1, LINE2);
    expect(metadata.satelliteNumber).toBe("00005");
    expect(metadata.tleEpochUtc).toBe("2000-06-27T18:50:19.733Z");
    expect(metadata.periodSeconds / 60).toBeCloseTo(1440 / 10.82419157, 5);
    const propagator = new TleSgp4OrbitPropagator({ line1: LINE1, line2: LINE2, simulationEpochUtc: metadata.tleEpochUtc });
    const state = propagator.propagate(0);
    expect(state.positionEciM[0] / 1000).toBeCloseTo(7022.465, 1);
    expect(state.positionEciM[1] / 1000).toBeCloseTo(-1400.083, 1);
    expect(state.velocityEciMps[2] / 1000).toBeCloseTo(4.534807, 3);
  });

  it("rejects checksum and satellite-number errors", () => {
    expect(() => parseTleMetadata(LINE1.slice(0, -1) + "4", LINE2)).toThrow(/校验和/);
    expect(() => parseTleMetadata(LINE1, replaceChecksum(LINE2.replace("00005", "00006")))).toThrow(/卫星编号/);
  });
});

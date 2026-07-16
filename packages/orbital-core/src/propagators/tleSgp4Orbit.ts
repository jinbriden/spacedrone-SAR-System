import { propagate, SatRecError, twoline2satrec, type SatRec } from "satellite.js";
import type { OrbitPropagator } from "./orbitPropagator";

export interface TleSgp4OrbitConfig {
  line1: string;
  line2: string;
  simulationEpochUtc?: string;
}

export interface TleMetadata {
  satelliteNumber: string;
  tleEpochUtc: string;
  meanMotionRevolutionsPerDay: number;
  periodSeconds: number;
  method: "near-earth" | "deep-space";
}

function validateChecksum(line: string, label: string): void {
  if (line.length < 69) throw new RangeError(`${label} 必须至少包含标准 TLE 的 69 个字符。`);
  const expected = Number(line[68]);
  if (!Number.isInteger(expected)) throw new RangeError(`${label} 第 69 位必须是校验和数字。`);
  let checksum = 0;
  for (const character of line.slice(0, 68)) {
    if (character >= "0" && character <= "9") checksum += Number(character);
    else if (character === "-") checksum += 1;
  }
  if (checksum % 10 !== expected) throw new RangeError(`${label} 校验和错误：应为 ${checksum % 10}，实际为 ${expected}。`);
}

function parseSatrec(line1: string, line2: string): SatRec {
  const first = line1.trimEnd();
  const second = line2.trimEnd();
  if (!first.startsWith("1 ")) throw new RangeError("TLE 第一行必须以“1 ”开头。" );
  if (!second.startsWith("2 ")) throw new RangeError("TLE 第二行必须以“2 ”开头。" );
  validateChecksum(first, "TLE 第一行");
  validateChecksum(second, "TLE 第二行");
  const firstNumber = first.slice(2, 7).trim();
  const secondNumber = second.slice(2, 7).trim();
  if (!firstNumber || firstNumber !== secondNumber) throw new RangeError("TLE 两行卫星编号不一致。" );
  const satrec = twoline2satrec(first, second);
  if (satrec.error !== SatRecError.None) throw new RangeError(`TLE 初始化失败：SatRecError=${SatRecError[satrec.error]}。`);
  return satrec;
}

export function parseTleMetadata(line1: string, line2: string): TleMetadata {
  const satrec = parseSatrec(line1, line2);
  const meanMotionRevolutionsPerDay = Number(line2.slice(52, 63));
  if (!Number.isFinite(meanMotionRevolutionsPerDay) || meanMotionRevolutionsPerDay <= 0) {
    throw new RangeError("TLE 第二行平均运动必须是正有限数。");
  }
  const periodSeconds = 86_400 / meanMotionRevolutionsPerDay;
  return {
    satelliteNumber: satrec.satnum,
    tleEpochUtc: new Date((satrec.jdsatepoch - 2_440_587.5) * 86_400_000).toISOString(),
    meanMotionRevolutionsPerDay,
    periodSeconds,
    method: satrec.method === "d" ? "deep-space" : "near-earth",
  };
}

export class TleSgp4OrbitPropagator implements OrbitPropagator {
  readonly periodSeconds: number;
  readonly metadata: TleMetadata;
  private readonly satrec: SatRec;
  private readonly simulationEpochMs: number;

  constructor(config: TleSgp4OrbitConfig) {
    this.satrec = parseSatrec(config.line1, config.line2);
    this.metadata = parseTleMetadata(config.line1, config.line2);
    this.periodSeconds = this.metadata.periodSeconds;
    const epochUtc = config.simulationEpochUtc ?? this.metadata.tleEpochUtc;
    this.simulationEpochMs = Date.parse(epochUtc);
    if (!Number.isFinite(this.simulationEpochMs)) throw new RangeError("SGP4 仿真历元必须是有效 UTC 时间。" );
  }

  propagate(epochSeconds: number) {
    if (!Number.isFinite(epochSeconds)) throw new RangeError("SGP4 传播时间必须是有限秒数。" );
    const result = propagate(this.satrec, new Date(this.simulationEpochMs + epochSeconds * 1000));
    if (result === null || this.satrec.error !== SatRecError.None) {
      throw new RangeError(`SGP4 传播失败：SatRecError=${SatRecError[this.satrec.error]}。`);
    }
    return {
      positionEciM: [result.position.x * 1000, result.position.y * 1000, result.position.z * 1000] as [number, number, number],
      velocityEciMps: [result.velocity.x * 1000, result.velocity.y * 1000, result.velocity.z * 1000] as [number, number, number],
    };
  }
}

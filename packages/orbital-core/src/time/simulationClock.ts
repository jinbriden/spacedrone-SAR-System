export interface SimulationClockOptions {
  startUtc: Date;
  playbackRate?: number;
  elapsedSeconds?: number;
  playing?: boolean;
}

/** A frame-rate-independent simulation clock advanced by measured real time. */
export class SimulationClock {
  readonly startUtc: Date;
  elapsedSeconds: number;
  playbackRate: number;
  playing: boolean;

  constructor(options: SimulationClockOptions) {
    this.startUtc = new Date(options.startUtc);
    this.elapsedSeconds = options.elapsedSeconds ?? 0;
    this.playbackRate = options.playbackRate ?? 1;
    this.playing = options.playing ?? false;
  }

  get currentUtc(): Date {
    return new Date(this.startUtc.getTime() + this.elapsedSeconds * 1000);
  }

  advance(realDeltaSeconds: number): void {
    if (!this.playing) return;
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) {
      throw new RangeError("真实时间增量必须是非负有限数值。");
    }
    this.elapsedSeconds += realDeltaSeconds * this.playbackRate;
  }

  step(simulationDeltaSeconds: number): void {
    this.elapsedSeconds = Math.max(0, this.elapsedSeconds + simulationDeltaSeconds);
  }

  reset(): void {
    this.elapsedSeconds = 0;
  }
}

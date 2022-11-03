/** Measures the time taken from construction to the call to stop() */
export class Timer {
  private readonly start: bigint;

  constructor() {
    this.start = process.hrtime.bigint();
  }

  stop(): number {
    const stop = process.hrtime.bigint();
    const elapsedNanos = stop - this.start;
    return Number(elapsedNanos / BigInt(1e6));
  }
}

/** Measures the time taken from construction to the call to stop() */
export class Timer {
  private readonly start: bigint; // nanoseconds
  private readonly expiry?: bigint; // nanoseconds

  /**
   * Constructor for Timer object.
   * @param expirationSeconds timer expiration in minutes
   */
  constructor(expirationMs?: number) {
    this.start = process.hrtime.bigint();
    if (expirationMs !== undefined) {
      this.expiry = BigInt(expirationMs) * BigInt(1e6);
    }
  }

  expired(): boolean {
    const elapsedNanos = this.elapsedNanos();
    return this.expiry !== undefined && elapsedNanos >= this.expiry;
  }

  elapsedNanos(): bigint {
    const stop = process.hrtime.bigint();
    return stop - this.start;
  }

  stop(): number {
    return Number(this.elapsedNanos() / BigInt(1e6));
  }
}

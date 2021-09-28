/** Measures the time taken from construction to the call to stop() */
export class Timer {
  private readonly start: [number, number];

  constructor() {
    this.start = process.hrtime();
  }

  stop(): number {
    const duration = process.hrtime(this.start);
    return duration[0] * 1000 + Math.round(duration[1] * 1e-6);
  }
}

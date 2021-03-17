import { logger } from "../../logger";
import * as track from "../../track";

interface Timing {
  type?: string;
  t0?: [number, number]; // [seconds, nanos]
}

export class DeploymentTimer {
  timings: { [name: string]: Timing } = {};

  startTimer(name: string, type: string) {
    this.timings[name] = { type: type, t0: process.hrtime() };
  }

  endTimer(name: string) {
    if (!this.timings[name]) {
      logger.debug("[functions] no timer initialized for", name);
      return;
    }

    // hrtime returns a duration as an array of [seconds, nanos]
    const duration = process.hrtime(this.timings[name].t0);
    track(
      "Functions Deploy (Duration)",
      this.timings[name].type,
      duration[0] * 1000 + Math.round(duration[1] * 1e-6)
    );
  }
}

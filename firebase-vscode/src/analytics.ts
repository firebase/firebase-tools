import {
  env,
  TelemetryLogger,
  TelemetrySender,
} from "vscode";
import { pluginLogger } from "./logger-wrapper";
import { AnalyticsParams, trackVSCode } from "./track";


export class AnalyticsLogger {
    readonly logger: TelemetryLogger
    constructor() {
        this.logger = env.createTelemetryLogger(new GA4TelemetrySender(pluginLogger));
    }
}

class GA4TelemetrySender implements TelemetrySender {
  constructor(readonly pluginLogger) {}

  sendEventData(
    eventName: string,
    data?: Record<string, any> | undefined,
  ): void {
    if (!env.isTelemetryEnabled) {
      pluginLogger.warn("Telemetry is not enabled.")
    }
    if (!data) {
      return;
    }
    trackVSCode(eventName, data as AnalyticsParams);
  }

  sendErrorData(error: Error, data?: Record<string, any> | undefined): void {
    // n/a
  }
}

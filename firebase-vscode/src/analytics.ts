import { env, TelemetryLogger, TelemetrySender } from "vscode";
import { pluginLogger } from "./logger-wrapper";
import { AnalyticsParams, trackVSCode } from "../../src/track";
import {env as monospaceEnv} from "../src/core/env";

export const IDX_METRIC_NOTICE = `
When you use the Firebase Data Connect Extension, Google collects telemetry data such as usage statistics, error metrics, and crash reports. Telemetry helps us better understand how the Firebase Extension is performing, where improvements need to be made, and how features are being used. Firebase uses this data, consistent with our [Google Privacy Policy](https://policies.google.com/privacy?hl=en-US), to provide, improve, and develop Firebase products and services.
We take steps to protect your privacy as part of this process. This includes disconnecting your telemetry data from your Google Account, fully anonymizing it, and storing that data for up to 14 months. 
Read more in our [Privacy Policy](https://policies.google.com/privacy?hl=en-US).
`;

export enum DATA_CONNECT_EVENT_NAME {
  EXTENSION_START = "extension_start",
  COMMAND_EXECUTION = "command_execution",
  DEPLOY_ALL = "deploy_all",
  DEPLOY_INDIVIDUAL = "deploy_individual",
  IDX_LOGIN = "idx_login",
  LOGIN = "login",
  PROJECT_SELECT = "project_select",
  RUN_LOCAL = "run_local",
  RUN_PROD = "run_prod",
  ADD_DATA = "add_data",
  READ_DATA = "read_data",
  MOVE_TO_CONNECTOR = "move_to_connector",
  START_EMULATOR_FROM_EXECUTION = "start_emulator_from_execution",
  REFUSE_START_EMULATOR_FROM_EXECUTION = "refuse_start_emulator_from_execution",
  INIT_SDK = "init_sdk",
  INIT_SDK_CLI = "init_sdk_cli",
  INIT_SDK_CODELENSE = "init_sdk_codelense",
  START_EMULATORS = "start_emulators",
}

export class AnalyticsLogger {
  readonly logger: TelemetryLogger;
  constructor() {
    this.logger = env.createTelemetryLogger(
      new GA4TelemetrySender(pluginLogger),
    );
  }
}

class GA4TelemetrySender implements TelemetrySender {
  constructor(readonly pluginLogger: { warn: (s: string) => void }) {
    // initial event to start session
    this.sendEventData(DATA_CONNECT_EVENT_NAME.EXTENSION_START);
  }

  sendEventData(
    eventName: string,
    data?: Record<string, any> | undefined,
  ): void {
    // telemtry flag does not exist in monospace
    if (!env.isTelemetryEnabled && !monospaceEnv.value.isMonospace) {
      this.pluginLogger.warn("Telemetry is not enabled.");
      return;
    }

    // telemetry logger adds prefixes to eventName and params that are disallowed in GA4
    eventName = eventName.replace("firebase.firebase-vscode/", "");
    for (const key in data) {
      if (key.includes("common.")) {
        data[key.replace("common.", "")] = data[key];
        delete data[key];
      }
    }
    data = { ...data };
    trackVSCode(eventName, data as AnalyticsParams);
  }

  sendErrorData(error: Error, data?: Record<string, any> | undefined): void {
    // n/a
    // TODO: Sanatize error messages for user data
  }
}

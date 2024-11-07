import vscode, { env, TelemetryLogger, TelemetrySender } from "vscode";
import { pluginLogger } from "./logger-wrapper";
import { AnalyticsParams, trackVSCode } from "../../src/track";
import { env as monospaceEnv } from "../src/core/env";

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
  AUTO_COMPLETE = "auto_complete",
  SESSION_CHAR_COUNT = "session_char_count",
}

export class AnalyticsLogger {
  readonly logger: TelemetryLogger;
  private disposable: vscode.Disposable;
  private sessionCharCount = 0; // Track total chars for the session

  constructor() {
    this.logger = env.createTelemetryLogger(
      new GA4TelemetrySender(pluginLogger),
    );

    let subscriptions: vscode.Disposable[] = [
      vscode.workspace.onDidChangeTextDocument(
        this.trackWrittenCharacters,
        this,
      ),
      vscode.workspace.onDidChangeTextDocument(
        this.trackWrittenCharactersInSession,
        this,
      ),
      vscode.commands.registerCommand(
        "fdc.logCompletionItem",
        this.listenForAutocompleteEvent,
      ),
    ];

    this.disposable = vscode.Disposable.from(...subscriptions);
  }

  onDispose() {
    this.disposable.dispose();
  }

  private TYPING_TRACK_DURATION = 5000;
  private typedCharCount = 0;
  private timeoutHandle: NodeJS.Timeout | undefined | null;

  // Track manual typing during a session.
  private trackWrittenCharactersInSession = (
    e: vscode.TextDocumentChangeEvent,
  ) => {
    e.contentChanges.forEach((change) => {
      if (change.text === "") {
        // Handle text deletion (backspace).
        this.sessionCharCount = Math.max(
          0,
          this.sessionCharCount - change.rangeLength,
        );
      } else {
        // Add the number of manually typed characters.
        this.sessionCharCount += change.text.length;
      }
    });
  };

  private trackWrittenCharacters = (e: vscode.TextDocumentChangeEvent) => {
    e.contentChanges.forEach((change) => {
      if (change.text === "") {
        // Text deletion (backspace)
        this.typedCharCount = Math.max(
          0,
          this.typedCharCount - change.rangeLength,
        );
      } else {
        this.typedCharCount += change.text.length;
      }
    });
  };

  listenForAutocompleteEvent = (label: string) => {
    if (this.timeoutHandle) {
      // Log the previously tracked session before resetting.
      this.endAutocompleteTrackingSession(label);
    }

    // Reset the count for tracking characters written after autocomplete.
    this.typedCharCount = 0;

    // Start a new tracking session with a timeout.
    this.timeoutHandle = setTimeout(() => {
      this.endAutocompleteTrackingSession(label);
    }, this.TYPING_TRACK_DURATION);

    this.logger.logUsage(DATA_CONNECT_EVENT_NAME.AUTO_COMPLETE, {
      label,
    });
  };

  private endAutocompleteTrackingSession(label?: string) {
    if (this.typedCharCount > 0) {
      this.logger.logUsage(DATA_CONNECT_EVENT_NAME.AUTO_COMPLETE, {
        autoCompleted: label,
        charsCountAfterAutocomplete: this.typedCharCount,
      });
    }

    // Reset the count and clear the timeout.
    this.typedCharCount = 0;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  endSession() {
    this.logger.logUsage(DATA_CONNECT_EVENT_NAME.SESSION_CHAR_COUNT, {
      totalChars: this.sessionCharCount,
    });

    this.sessionCharCount = 0;
  }
}

class GA4TelemetrySender implements TelemetrySender {
  private hasSentData = false;
  constructor(readonly pluginLogger: { warn: (s: string) => void }) {}

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
    eventName = eventName.replace(
      "GoogleCloudTools.firebase-dataconnect-vscode/",
      "",
    );

    // sanitize string as a fallback; numbers, letters, and underscore only
    eventName = eventName.replace(/[^a-zA-Z0-9_]/g, "");

    for (const key in data) {
      if (key.includes("common.")) {
        data[key.replace("common.", "")] = data[key];
        delete data[key];
      }
    }
    data = { ...data };
    const idxPrepend = monospaceEnv.value.isMonospace ? "idx_" : "";

    if (!this.hasSentData) {
      trackVSCode(`${idxPrepend}DATA_CONNECT_EVENT_NAME.EXTENSION_START`);
      this.hasSentData = true;
    }
    trackVSCode(`${idxPrepend}${eventName}`, data as AnalyticsParams);
  }

  sendErrorData(error: Error, data?: Record<string, any> | undefined): void {
    // n/a
    // TODO: Sanatize error messages for user data
  }
}

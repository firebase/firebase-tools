import * as vscode from "vscode";

import { ExtensionBroker } from "./extension-broker";
import { createBroker } from "../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../common/messaging/protocol";
import { logSetup, pluginLogger } from "./logger-wrapper";
import { registerWebview } from "./webview";
import { registerCore } from "./core";
import { getSettings, updateIdxSetting } from "./utils/settings";
import { registerFdc } from "./data-connect";
import { AuthService } from "./auth/service";
import {
  AnalyticsLogger,
  DATA_CONNECT_EVENT_NAME,
  IDX_METRIC_NOTICE,
} from "./analytics";
import { env } from "./core/env";

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  logSetup();
  pluginLogger.debug("Activating Firebase extension.");

  const broker = createBroker<
    ExtensionToWebviewParamsMap,
    WebviewToExtensionParamsMap,
    vscode.Webview
  >(new ExtensionBroker());

  const authService = new AuthService(broker);
  const analyticsLogger = new AnalyticsLogger();

  // show IDX data collection notice
  if (settings.shouldShowIdxMetricNotice && env.value.isMonospace) {
    // don't await/block on this
    vscode.window.showInformationMessage(IDX_METRIC_NOTICE, "Ok").then(() => {
      updateIdxSetting(false); // don't show message again
    });
  }

  // log start event for session tracking
  analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.EXTENSION_START);

  const [emulatorsController, coreDisposable] = await registerCore(
    broker,
    context,
    analyticsLogger.logger,
  );

  context.subscriptions.push(
    coreDisposable,
    registerWebview({
      name: "sidebar",
      broker,
      context,
    }),
    authService,
    registerFdc(
      context,
      broker,
      authService,
      emulatorsController,
      analyticsLogger.logger,
    ),
  );
}

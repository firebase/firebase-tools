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
import { getSettings } from "./utils/settings";
import { registerHosting } from "./hosting";
import { registerFdc } from "./data-connect";
import { AuthService } from "./auth/service";
import { AnalyticsLogger } from "./analytics";

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  logSetup(settings);
  pluginLogger.debug("Activating Firebase extension.");

  const broker = createBroker<
    ExtensionToWebviewParamsMap,
    WebviewToExtensionParamsMap,
    vscode.Webview
  >(new ExtensionBroker());

  const authService = new AuthService(broker);
  const analyticsLogger = new AnalyticsLogger();

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
    registerHosting(broker),
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

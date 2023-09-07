// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { ExtensionBroker } from "./extension-broker";
import { createBroker } from "../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../common/messaging/protocol";
import { setupWorkflow } from "./workflow";
import { pluginLogger } from "./logger-wrapper";
import { registerWebview } from "./webview";
import { registerEmulators } from "./core/emulators";
import { registerConfig } from "./core/config";
import { registerEnv } from "./core/env";
import { getSettings } from "./core/settings";

const broker = createBroker<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  vscode.Webview
>(new ExtensionBroker());

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  pluginLogger.debug("Activating Firebase extension.");

  const settings = getSettings();

  setupWorkflow(context, broker, settings);

  const subscriptions = [
    registerEnv(broker),
    registerConfig(broker),
    registerWebview({
      name: "sidebar",
      broker,
      context,
    })
  ];

  if (settings.featuresEnabled.emulators) {
    subscriptions.push(registerEmulators(broker));
  }

  context.subscriptions.push(...subscriptions);
}

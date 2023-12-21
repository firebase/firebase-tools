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
import { registerFiremat } from "./firemat";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  const settings = getSettings();
  logSetup(settings);
  pluginLogger.debug("Activating Firebase extension.");

  const broker = createBroker<
    ExtensionToWebviewParamsMap,
    WebviewToExtensionParamsMap,
    vscode.Webview
  >(new ExtensionBroker());

  context.subscriptions.push(
    registerCore({ broker, context }),
    registerWebview({
      name: "sidebar",
      broker,
      context,
    }),
    registerHosting(broker),
    registerFiremat(context, broker)
  );
}

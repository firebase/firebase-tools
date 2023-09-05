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
import { registerFiremat } from "./firemat";
import { onShutdown } from "./workflow";

const broker = createBroker<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  vscode.Webview
>(new ExtensionBroker());

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  pluginLogger.debug("Activating Firebase extension.");

  setupWorkflow(context, broker);

  context.subscriptions.push(
    registerWebview({
      name: "sidebar",
      broker,
      context,
    }),
    registerFiremat(context, broker)
  );
}

// This method is called when the extension is deactivated
export async function deactivate() {
  // This await is optimistic but it might wait for a moment longer while we run cleanup activities
  await onShutdown();
}

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { ExtensionBroker } from "./extension-broker";
import { createBroker } from "../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../common/messaging/protocol";
import { setupSidebar } from "./sidebar";
import { setupWorkflow } from "./workflow";
import { pluginLogger } from "./logger-wrapper";
import { onShutdown } from "./workflow";

const broker = createBroker<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  vscode.Webview
>(new ExtensionBroker());

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  pluginLogger.debug('Activating Firebase extension.');

  setupWorkflow(context, broker);
  setupSidebar(context, broker);
}

// This method is called when the extension is deactivated
export async function deactivate() {
  // This await is optimistic but it might wait for a moment longer while we run cleanup activities
  await onShutdown();
}

import * as vscode from "vscode";

import { LanguageClient } from "vscode-languageclient/node";

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

  // Initial data load for schema explorer, needs to be after registration
  // TODO: rethink this logic in relation to connecting to emulator
  vscode.commands.executeCommand('firebase.firemat.executeIntrospection');
}

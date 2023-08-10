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
import { ExecutionHistoryTreeDataProvider as FirematExecutionHistoryTreeDataProvider } from "./firemat/execution-history-provider";
import { CodeLensProvider as FirematCodeLensProvider } from "./firemat/code-lens-provider";
import { ExecutionResultsViewProvider as FirematExecutionResultsViewProvider } from "./firemat/execution-results-provider";
import { ExecutionService as FirematExecutionService } from "./firemat/execution-service";

const broker = createBroker<
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
  vscode.Webview
>(new ExtensionBroker());

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  pluginLogger.debug("Activating Firebase extension.");

  setupWorkflow(context, broker);
  setupSidebar(context, broker);

  const firematExecutionHistoryTreeDataProvider =
    new FirematExecutionHistoryTreeDataProvider();
  const firematExecutionHistoryTreeView = vscode.window.createTreeView(
    "firebase.firemat.executionHistoryView",
    { treeDataProvider: firematExecutionHistoryTreeDataProvider }
  );
  const firematCodeLensProvider = new FirematCodeLensProvider();
  const firematExecutionResultsViewProvider =
    new FirematExecutionResultsViewProvider(context.extensionUri, broker);
  const firematExecutionService = new FirematExecutionService();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "firemat.executionResultsView",
      firematExecutionResultsViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand(
      "firebase.firemat.executeOperation",
      () => {}
    ),
    vscode.commands.registerCommand(
      "firebase.firemat.executeOperationAtCursor",
      () => {}
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "graphql" },
      firematCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: "file", language: "gql" },
      firematCodeLensProvider
    )
  );
}

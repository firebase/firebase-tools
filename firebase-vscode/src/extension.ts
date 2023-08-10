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
import { ExplorerTreeDataProvider as FirematExplorerTreeDataProvider } from "./firemat/explorer-provider";
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
  const firematExplorerTreeDataProvider = new FirematExplorerTreeDataProvider();
  const firematExplorerTreeView = vscode.window.createTreeView(
    "firebase.firemat.explorerView",
    { treeDataProvider: firematExplorerTreeDataProvider }
  );
  const firematExecutionService = new FirematExecutionService();

  context.subscriptions.push(
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

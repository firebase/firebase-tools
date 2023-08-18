import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerWebview } from "../webview";
import { ExecutionHistoryTreeDataProvider } from "./execution-history-provider";
import {
  ExecutionState,
  createExecution,
  executionArgs,
  selectExecutionId,
  selectedExecution,
  selectedExecutionId,
  updateExecution,
} from "./execution-store";
import { batch, effect } from "@preact/signals-core";
import { OperationDefinitionNode, print } from "graphql";
import { FirematService } from "./service";

export function registerExecution(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  firematService: FirematService
): Disposable {
  const treeDataProvider = new ExecutionHistoryTreeDataProvider();
  const executionHistoryTreeView = vscode.window.createTreeView(
    "firemat-execution-history",
    {
      treeDataProvider,
    }
  );

  // Select the corresponding tree-item when the selected-execution-id updates
  effect(() => {
    const id = selectedExecutionId.value;
    const selectedItem = treeDataProvider.executionItems.find(
      ({ item }) => item.executionId === id
    );
    executionHistoryTreeView.reveal(selectedItem, { select: true });
  });

  // Listen for changes to the selected-execution item
  effect(() => {
    const item = selectedExecution.value;
    if (item) {
      broker.send("notifyFirematResults", {
        args: item.args,
        query: print(item.operation),
        results: item.results,
      });
    }
  });

  async function executeOperation(ast: OperationDefinitionNode) {
    const item = createExecution({
      label: ast.name.value,
      timestamp: Date.now(),
      state: ExecutionState.RUNNING,
      operation: ast,
      args: executionArgs.value,
    });

    const results = await firematService.executeGraphQL({
      query: print(ast),
      variables: executionArgs.value,
    });

    batch(() => {
      updateExecution(item.executionId, {
        ...item,
        state: ExecutionState.FINISHED,
        results,
      });
      selectExecutionId(item.executionId);
    });
  }

  return Disposable.from(
    registerWebview({
      name: "firemat-execution-arguments",
      context,
      broker,
    }),
    registerWebview({
      name: "firemat-execution-results",
      context,
      broker,
    }),
    executionHistoryTreeView,
    vscode.commands.registerCommand(
      "firebase.firemat.executeOperation",
      executeOperation
    ),
    vscode.commands.registerCommand(
      "firebase.firemat.selectExecutionResultToShow",
      (executionId) => {
        selectExecutionId(executionId);
      }
    )
  );
}

import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerWebview } from "../webview";
import { ExecutionHistoryTreeDataProvider } from "./execution-history-provider";
import {
  ExecutionItem,
  ExecutionState,
  createExecution,
  executionArgsJSON,
  selectExecutionId,
  selectedExecution,
  selectedExecutionId,
  updateExecution,
} from "./execution-store";
import { batch, effect } from "@preact/signals-core";
import { OperationDefinitionNode, print } from "graphql";
import { FirematService } from "./service";
import { FirematError, toSerializedError } from "../../common/error";

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
        args: item.args ?? "{}",
        query: print(item.operation),
        results:
          item.results instanceof Error
            ? toSerializedError(item.results)
            : item.results,
        displayName: item.operation.operation + ": " + item.label,
      });
    }
  });

  async function executeOperation(
    ast: OperationDefinitionNode,
    {
      document,
      documentPath,
      position,
    }: { documentPath: string; position: vscode.Position; document: string }
  ) {
    const item = createExecution({
      label: ast.name?.value ?? "anonymous",
      timestamp: Date.now(),
      state: ExecutionState.RUNNING,
      operation: ast,
      args: executionArgsJSON.value,
      documentPath,
      position,
    });

    function updateAndSelect(updates: Partial<ExecutionItem>) {
      batch(() => {
        updateExecution(item.executionId, { ...item, ...updates });
        selectExecutionId(item.executionId);
      });
    }

    try {
      // Execute queries/mutations from their source code.
      // That ensures that we can execute queries in unsaved files.
      const results = await firematService.executeGraphQL({
        operationName: ast.name?.value,
        // We send the whole unparsed document to guarantee
        // that there are no formatting differences between the real document
        // and the document that is sent to the emulator.
        query: document,
        variables: executionArgsJSON.value,
      });

      updateAndSelect({
        state:
          // Executing queries may return a response which contains errors
          // without throwing.
          // In that case, we mark the execution as errored.
          (results.errors?.length ?? 0) > 0
            ? ExecutionState.ERRORED
            : ExecutionState.FINISHED,
        results,
      });
    } catch (error) {
      updateAndSelect({
        state: ExecutionState.ERRORED,
        results:
          error instanceof Error
            ? error
            : new FirematError("Unknown error", undefined, error),
      });
    }
  }

  broker.on("definedFirematArgs", (value) => (executionArgsJSON.value = value));

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

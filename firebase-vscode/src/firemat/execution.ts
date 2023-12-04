import vscode, { Disposable, ExtensionContext } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerWebview } from "../webview";
import { ExecutionHistoryTreeDataProvider } from "./execution-history-provider";
import {
  ExecutionItem,
  ExecutionState,
  createExecution,
  executionArgs,
  selectExecutionId,
  selectedExecution,
  selectedExecutionId,
  setExecutionArgs,
  updateExecution,
} from "./execution-store";
import { batch, effect } from "@preact/signals-core";
import { OperationDefinitionNode, print } from "graphql";
import { FirematService } from "./service";
import { OPERATION_TYPE } from "./types";
import { FirematError } from "../../common/error";

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
        displayName: item.operation.operation + ": " + item.label,
      });
    }
  });

  async function executeOperation(
    ast: OperationDefinitionNode,
    { documentPath, position }
  ) {
    const item = createExecution({
      label: ast.name.value,
      timestamp: Date.now(),
      state: ExecutionState.RUNNING,
      operation: ast,
      args: executionArgs.value,
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
      // execute query or mutation
      const results =
        ast.operation === (OPERATION_TYPE.query as string)
          ? await firematService.executeQuery({
              operation_name: ast.name.value,
              query: print(ast),
              variables: executionArgs.value,
            })
          : await firematService.executeMutation({
              operation_name: ast.name.value,
              mutation: print(ast),
              variables: executionArgs.value,
            });

        console.log('results', results)

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
      console.log('on error', error)
      updateAndSelect({
        state: ExecutionState.ERRORED,
        results:
          error instanceof FirematError
            ? error
            : new FirematError("Unknown error", undefined, error),
      });
    }
  }

  broker.on("definedFirematArgs", setExecutionArgs);

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

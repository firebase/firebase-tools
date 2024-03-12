import vscode, {
  ConfigurationTarget,
  Disposable,
  ExtensionContext,
} from "vscode";
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
import { OperationDefinitionNode, OperationTypeNode, print } from "graphql";
import { DataConnectService } from "./service";
import { DataConnectError, toSerializedError } from "../../common/error";
import { OperationLocation } from "./types";
import { emulatorInstance, selectedInstance } from "./connect-instance";
import { EmulatorsController } from "../core/emulators";

export function registerExecution(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  dataConnectService: DataConnectService,
  emulatorsController: EmulatorsController,
): Disposable {
  const treeDataProvider = new ExecutionHistoryTreeDataProvider();
  const executionHistoryTreeView = vscode.window.createTreeView(
    "data-connect-execution-history",
    {
      treeDataProvider,
    },
  );

  // Select the corresponding tree-item when the selected-execution-id updates
  effect(() => {
    const id = selectedExecutionId.value;
    const selectedItem = treeDataProvider.executionItems.find(
      ({ item }) => item.executionId === id,
    );
    executionHistoryTreeView.reveal(selectedItem, { select: true });
  });

  // Listen for changes to the selected-execution item
  effect(() => {
    const item = selectedExecution.value;
    if (item) {
      broker.send("notifyDataConnectResults", {
        args: item.args ?? "{}",
        query: print(item.operation),
        results:
          item.results instanceof Error
            ? toSerializedError(item.results)
            : item.results,
        displayName: item.operation.operation,
      });
    }
  });

  async function executeOperation(
    ast: OperationDefinitionNode,
    { document, documentPath, position }: OperationLocation,
  ) {
    const configs = vscode.workspace.getConfiguration("firebase.dataConnect");
    const alwaysExecuteMutationsInProduction =
      "alwaysAllowMutationsInProduction";
    const alwaysStartEmulator = "alwaysStartEmulator";

    // De-structure the selected instance, to avoid cases where we execute the
    // operation in a different instance than the one selected, in the case
    // where a user changes instance during an "await".
    const targetedInstance = selectedInstance.value;

    if (
      targetedInstance === emulatorInstance &&
      !emulatorsController.areEmulatorsRunning.value
    ) {
      const always = "Yes (always)";
      const yes = "Yes";
      const result = await vscode.window.showWarningMessage(
        "Trying to execute an operation on the emulator, but it isn't started yet. " +
          "Do you wish to start it?",
        { modal: true },
        yes,
        always,
      );

      // If the user selects "always", we update User settings.
      if (result === always) {
        configs.update(alwaysStartEmulator, true, ConfigurationTarget.Global);
      }

      if (result === yes || result === always) {
        await vscode.commands.executeCommand("firebase.emulators.start");
      }
    }

    // Warn against using mutations in production.
    if (
      targetedInstance !== emulatorInstance &&
      !configs.get(alwaysExecuteMutationsInProduction) &&
      ast.operation === OperationTypeNode.MUTATION
    ) {
      const always = "Yes (always)";
      const yes = "Yes";
      const result = await vscode.window.showWarningMessage(
        "You are about to perform a mutation in production environment. Are you sure?",
        { modal: true },
        yes,
        always,
      );

      if (result !== always && result !== yes) {
        return;
      }

      // If the user selects "always", we update User settings.
      if (result === always) {
        configs.update(
          alwaysExecuteMutationsInProduction,
          true,
          ConfigurationTarget.Global,
        );
      }
    }

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

    let results;
    try {
      // Execute queries/mutations from their source code.
      // That ensures that we can execute queries in unsaved files.
      results = await dataConnectService.executeGraphQL({
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
            : new DataConnectError("Unknown error", error),
      });
    }
  }

  broker.on("definedDataConnectArgs", (value) => (executionArgsJSON.value = value));

  return Disposable.from(
    registerWebview({
      name: "data-connect-execution-configuration",
      context,
      broker,
    }),
    registerWebview({
      name: "data-connect-execution-results",
      context,
      broker,
    }),
    executionHistoryTreeView,
    vscode.commands.registerCommand(
      "firebase.dataConnect.executeOperation",
      executeOperation,
    ),
    vscode.commands.registerCommand(
      "firebase.dataConnect.selectExecutionResultToShow",
      (executionId) => {
        selectExecutionId(executionId);
      },
    ),
  );
}

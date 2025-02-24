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
import { InstanceType } from "./code-lens-provider";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../analytics";
import { EmulatorsController } from "../core/emulators";

export function registerExecution(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  dataConnectService: DataConnectService,
  analyticsLogger: AnalyticsLogger,
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
  const sub1 = effect(() => {
    const id = selectedExecutionId.value;
    const selectedItem = treeDataProvider.executionItems.find(
      ({ item }) => item.executionId === id,
    );
    executionHistoryTreeView.reveal(selectedItem, { select: true });
  });

  function notifyDataConnectResults(item: ExecutionItem) {
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

  // Listen for changes to the selected-execution item
  const sub2 = effect(() => {
    const item = selectedExecution.value;
    if (item) {
      notifyDataConnectResults(item);
    }
  });

  const sub3 = broker.on("getDataConnectResults", () => {
    const item = selectedExecution.value;
    if (item) {
      notifyDataConnectResults(item);
    }
  });

  async function executeOperation(
    ast: OperationDefinitionNode,
    { document, documentPath, position }: OperationLocation,
    instance: InstanceType,
  ) {
    const configs = vscode.workspace.getConfiguration("firebase.dataConnect");

    const alwaysExecuteMutationsInProduction =
      "alwaysAllowMutationsInProduction";
    const alwaysStartEmulator = "alwaysStartEmulator";

    // notify users that emulator is starting
    if (
      instance === InstanceType.LOCAL &&
      !(await emulatorsController.areEmulatorsRunning())
    ) {
      vscode.window.showWarningMessage(
        "Automatically starting emulator... Please retry `Run local` execution after it's started.",
        { modal: false },
      );
      analyticsLogger.logger.logUsage(
        DATA_CONNECT_EVENT_NAME.START_EMULATOR_FROM_EXECUTION,
      );
      emulatorsController.startEmulators();
      return;
    }

    // Warn against using mutations in production.
    if (
      instance !== InstanceType.LOCAL &&
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

    try {
      // Execute queries/mutations from their source code.
      // That ensures that we can execute queries in unsaved files.

      const results = await dataConnectService.executeGraphQL({
        operationName: ast.name?.value,
        // We send the whole unparsed document to guarantee
        // that there are no formatting differences between the real document
        // and the document that is sent to the emulator.
        query: document,
        variables: executionArgsJSON.value,
        path: documentPath,
        instance,
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

  const sub4 = broker.on(
    "definedDataConnectArgs",
    (value) => (executionArgsJSON.value = value),
  );

  return Disposable.from(
    { dispose: sub1 },
    { dispose: sub2 },
    { dispose: sub3 },
    { dispose: sub4 },
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
      (ast, location, instanceType: InstanceType) => {
        analyticsLogger.logger.logUsage(
          instanceType === InstanceType.LOCAL
            ? DATA_CONNECT_EVENT_NAME.RUN_LOCAL
            : DATA_CONNECT_EVENT_NAME.RUN_PROD,
        );
        executeOperation(ast, location, instanceType);
      },
    ),
    vscode.commands.registerCommand(
      "firebase.dataConnect.selectExecutionResultToShow",
      (executionId) => {
        selectExecutionId(executionId);
      },
    ),
  );
}

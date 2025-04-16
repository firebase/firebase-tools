import vscode, {
  ConfigurationTarget,
  Disposable,
  ExtensionContext,
} from "vscode";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { registerWebview } from "../../webview";
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
import { batch, effect, Signal } from "@preact/signals-core";
import {
  OperationDefinitionNode,
  OperationTypeNode,
  print,
  buildClientSchema,
  validate,
  DocumentNode,
  Kind,
  TypeNode,
  parse,
} from "graphql";
import { DataConnectService } from "../service";
import { DataConnectError, toSerializedError } from "../../../common/error";
import { OperationLocation } from "../types";
import { InstanceType } from "../code-lens-provider";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../../analytics";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { EmulatorsController } from "../../core/emulators";
import { getConnectorGQLText } from "../file-utils";
import { pluginLogger } from "../../logger-wrapper";

interface TypedInput {
  varName: string;
  type: string | null;
}

interface ExecutionInput {
  ast: OperationDefinitionNode;
  location: OperationLocation;
  instance: InstanceType;
}

export const lastExecutionInputSignal = new Signal<ExecutionInput | null>(null);

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

  // re run called from execution panel;
  const rerunExecutionBroker = broker.on("rerunExecution", () => {
    if (!lastExecutionInputSignal.value) {
      return;
    }
    executeOperation(
      lastExecutionInputSignal.value.ast,
      lastExecutionInputSignal.value.location,
      lastExecutionInputSignal.value.instance,
    );
  });

  async function executeOperation(
    ast: OperationDefinitionNode,
    { document, documentPath, position }: OperationLocation,
    instance: InstanceType,
  ) {
    // hold last execution in memory, and send operation name to webview
    lastExecutionInputSignal.value = {
      ast,
      location: { document, documentPath, position },
      instance,
    };
    broker.send("notifyLastOperation", ast.name?.value ?? "anonymous");

    // focus on execution panel immediately
    vscode.commands.executeCommand(
      "data-connect-execution-configuration.focus",
    );

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
        { modal: !process.env.VSCODE_TEST_MODE },
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

    // build schema
    const introspect = await dataConnectService.introspect();
    if (!introspect.data) {
      executionError("Please check your compilation errors");
      return undefined;
    }
    const schema = buildClientSchema(introspect.data);

    // get all gql files from connector and validate
    const gqlText = await getConnectorGQLText(documentPath);

    // Adhoc mutation
    if (!gqlText) {
      pluginLogger.info("Executing adhoc operation. Skipping validation.");
    } else {
      try {
        const connectorDocumentNode = parse(gqlText);

        const validationErrors = validate(schema, connectorDocumentNode);

        if (validationErrors.length > 0) {
          executionError(
            `Schema validation errors:`,
            JSON.stringify(validationErrors),
          );
          return;
        }
      } catch (error) {
        executionError("Schema validation error", error as string);
        return;
      }
    }
    

    // if execution args is empty, reset to {}
    if (!executionArgsJSON.value) {
      executionArgsJSON.value = "{}";
    }

    // Check for missing arguments
    const missingArgs = await verifyMissingArgs(ast, executionArgsJSON.value);

    // prompt user to continue execution or modify arguments
    if (missingArgs.length > 0) {
      // open a modal with option to run anyway or edit args
      const editArgs = { title: "Edit variables" };
      const continueExecution = { title: "Continue Execution" };
      const result = await vscode.window.showInformationMessage(
        `Missing required variables. Would you like to modify them?`,
        { modal: !process.env.VSCODE_TEST_MODE },
        editArgs,
        continueExecution,
      );

      if (result === editArgs) {
        const missingArgsJSON = getDefaultArgs(missingArgs);

        // combine w/ existing args, and send to webview
        const newArgsJsonString = JSON.stringify({
          ...JSON.parse(executionArgsJSON.value),
          ...missingArgsJSON,
        });

        broker.send("notifyDataConnectArgs", newArgsJsonString);
        return;
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
        // We send the compiled GQL from the whole connector to support fragments
        // In the case of adhoc operation, just send the sole document
        query: gqlText ?? document,
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
    { dispose: rerunExecutionBroker },
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
    vscode.commands.registerCommand(
      "firebase.openJsonDocument",
      async (content) => {
        await vscode.workspace.openTextDocument({ language: "json", content });
      },
    ),
  );
}

function executionError(message: string, error?: string) {
  vscode.window.showErrorMessage(
    `Failed to execute operation: ${message}: \n${JSON.stringify(error, undefined, 2)}`,
  );
  throw new Error(error);
}

function getArgsWithTypeFromOperation(
  ast: OperationDefinitionNode,
): TypedInput[] {
  if (!ast.variableDefinitions) {
    return [];
  }
  return ast.variableDefinitions.map((variable) => {
    const varName = variable.variable.name.value;

    const typeNode = variable.type;

    function getType(typeNode: TypeNode): string | null {
      // Same as previous example
      switch (typeNode.kind) {
        case "NamedType":
          return typeNode.name.value;
        case "ListType":
          const innerTypeName = getType(typeNode.type);
          return `[${innerTypeName}]`;
        case "NonNullType":
          const nonNullTypeName = getType(typeNode.type);
          return `${nonNullTypeName}!`;
        default:
          return null;
      }
    }

    const type = getType(typeNode);

    return { varName, type };
  });
}

// checks if required arguments are present in payload
async function verifyMissingArgs(
  ast: OperationDefinitionNode,
  jsonArgs: string,
): Promise<TypedInput[]> {
  let userArgs: { [key: string]: any };
  try {
    userArgs = JSON.parse(jsonArgs);
  } catch (e: any) {
    executionError("Invalid JSON: ", e);
    return [];
  }

  const argsWithType = getArgsWithTypeFromOperation(ast);
  if (!argsWithType) {
    return [];
  }
  return argsWithType
    .filter((arg) => arg.type?.includes("!"))
    .filter((arg) => !userArgs[arg.varName]);
}

function getDefaultArgs(args: TypedInput[]) {
  return args.reduce((acc: { [key: string]: any }, arg) => {
    const defaultValue = getDefaultScalarValue(arg.type as string);

    acc[arg.varName] = defaultValue;
    return acc;
  }, {});
}

// converts AST OperationDefinitionNode to a DocumentNode for schema validation
function operationDefinitionToDocument(
  operationDefinition: OperationDefinitionNode,
): DocumentNode {
  return {
    kind: Kind.DOCUMENT,
    definitions: [operationDefinition],
    loc: operationDefinition.loc,
  };
}

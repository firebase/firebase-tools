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
  selectExecutionId,
  selectedExecution,
  selectedExecutionId,
  updateExecution,
} from "./execution-store";
import { batch, effect } from "@preact/signals-core";
import {
  OperationDefinitionNode,
  OperationTypeNode,
  print,
  buildClientSchema,
  validate,
  parse,
} from "graphql";
import { DataConnectService } from "../service";
import { DataConnectError, toSerializedError } from "../../../common/error";
import { InstanceType } from "../code-lens-provider";
import { DATA_CONNECT_EVENT_NAME, AnalyticsLogger } from "../../analytics";
import { EmulatorsController } from "../../core/emulators";
import { getConnectorGQLText, insertQueryAt } from "../file-utils";
import { pluginLogger } from "../../logger-wrapper";
import * as gif from "../../../../src/gemini/fdcExperience";
import { ensureGIFApiTos } from "../../../../src/dataconnect/ensureApis";
import { configstore } from "../../../../src/configstore";
import { executionAuthParams, executionArgsJSON, ExecutionParamsService } from "./execution-params";
import { ExecuteGraphqlRequest } from "../../dataconnect/types";

export interface ExecutionInput {
  operationAst: OperationDefinitionNode;
  document: string;
  documentPath: string;
  position: vscode.Position;
  instance: InstanceType;
}

export interface GenerateOperationInput {
  projectId?: string;
  document: vscode.TextDocument;
  description: string;
  insertPosition: number;
  existingQuery: string;
}

export function registerExecution(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  dataConnectService: DataConnectService,
  paramsService: ExecutionParamsService,
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
      displayName: `${item.input.operationAst.operation} ${item.input.operationAst.name?.value ?? ""}`,
      query: print(item.input.operationAst),
      results:
        item.results instanceof Error
          ? toSerializedError(item.results)
          : item.results,
      variables: item.variables || "",
      auth: item.auth,
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
    const item = selectedExecution.value;
    if (item) {
      executeOperation(item.input);
    }
  });

  async function executeOperation(arg: ExecutionInput) {
    const { operationAst: ast, document, documentPath, instance } = arg;
    analyticsLogger.logger.logUsage(
      instance === InstanceType.LOCAL
        ? DATA_CONNECT_EVENT_NAME.RUN_LOCAL
        : DATA_CONNECT_EVENT_NAME.RUN_PROD,
    );
    analyticsLogger.logger.logUsage(
      instance === InstanceType.LOCAL
        ? DATA_CONNECT_EVENT_NAME.RUN_LOCAL + `_${ast.operation}`
        : DATA_CONNECT_EVENT_NAME.RUN_PROD + `_${ast.operation}`,
    );
    await vscode.window.activeTextEditor?.document.save();

    // focus on execution panel immediately
    vscode.commands.executeCommand(
      "data-connect-execution-parameters.focus",
    );

    const configs = vscode.workspace.getConfiguration("firebase.dataConnect");

    const alwaysExecuteMutationsInProduction =
      "alwaysAllowMutationsInProduction";

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
      analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_PROD_MUTATION_WARNING);
      const always = "Yes (always)";
      const yes = "Yes";
      const result = await vscode.window.showWarningMessage(
        "You are about to perform a mutation in production environment. Are you sure?",
        { modal: !process.env.VSCODE_TEST_MODE },
        yes,
        always,
      );

      switch (result) {
        case yes:
          analyticsLogger.logger.logUsage(
            DATA_CONNECT_EVENT_NAME.RUN_PROD_MUTATION_WARNING_ACKED
          );
          break;
        case always:
          // If the user selects "always", we update User settings.
          configs.update(
            alwaysExecuteMutationsInProduction,
            true,
            ConfigurationTarget.Global,
          );
          analyticsLogger.logger.logUsage(
            DATA_CONNECT_EVENT_NAME.RUN_PROD_MUTATION_WARNING_ACKED_ALWAYS
          );
          break;
        default:
          analyticsLogger.logger.logUsage(
            DATA_CONNECT_EVENT_NAME.RUN_PROD_MUTATION_WARNING_REJECTED
          );
          return;
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

    const servicePath = await dataConnectService.servicePath(documentPath);
    if (!servicePath) {
      throw new Error("No service found for document path: " + documentPath);
    }
    const req: ExecuteGraphqlRequest = {
      name: servicePath,
      operationName: ast.name?.value,
      variables: paramsService.executeGraphqlVariables(),
      query: gqlText || document,
      extensions: paramsService.executeGraphqlExtensions(),
    };

    const item = createExecution({
      label: ast.name?.value ?? "anonymous",
      timestamp: Date.now(),
      state: ExecutionState.RUNNING,
      input: arg,
      variables: executionArgsJSON.value,
      auth: executionAuthParams.value,
      results: new Error("missing results"),
    });

    try {
      // Execute queries/mutations from their source code.
      // That ensures that we can execute queries in unsaved files.
      const results = await dataConnectService.executeGraphQL(servicePath, instance, req);
      // Executing queries may return a response which contains errors
      item.state = (results.errors?.length ?? 0) > 0
        ? ExecutionState.ERRORED
        : ExecutionState.FINISHED;
      item.results = results;
    } catch (error) {
      item.state = ExecutionState.ERRORED;
      item.results = error instanceof Error
        ? error
        : new DataConnectError("Unknown error", error);
    }

    batch(() => {
      updateExecution(item.executionId, item);
      selectExecutionId(item.executionId);
    });

    if (item.state === ExecutionState.ERRORED) {
      await paramsService.applyFixes(ast);
    }
  }

  async function generateOperation(arg: GenerateOperationInput) {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GENERATE_OPERATION);
    if (!arg.projectId) {
      vscode.window.showErrorMessage(`Connect a Firebase project to use Gemini in Firebase features.`);
      return;
    }
    try {
      const schema = await dataConnectService.schema();
      const prompt = `Generate a Data Connect operation to match this description: ${arg.description} 
${arg.existingQuery ? `\n\nRefine this existing operation:\n${arg.existingQuery}` : ''}
${schema ? `\n\nUse the Data Connect Schema:\n\`\`\`graphql
${schema}
\`\`\`` : ""}`;
      const serviceName = await dataConnectService.servicePath(arg.document.fileName);
      if (!(await ensureGIFApiTos(arg.projectId))) {
        if (!(await showGiFToSModal(arg.projectId))) {
          return; // ToS isn't accepted.
        }
      }
      const res = await gif.generateOperation(prompt, serviceName, arg.projectId);
      await insertQueryAt(arg.document.uri, arg.insertPosition, arg.existingQuery, res);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to generate query: ${e.message}`);
    }
  }

  async function showGiFToSModal(projectId: string): Promise<boolean> {
    analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GIF_TOS_MODAL);
    const tos = "Terms of Service";
    const enable = "Enable";
    const result = await vscode.window.showWarningMessage(
      "Gemini in Firebase",
      {
        modal: !process.env.VSCODE_TEST_MODE,
        detail: "Gemini in Firebase helps you write Data Connect queries.",
      },
      enable,
      tos,
    );
    switch (result) {
      case enable:
        analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GIF_TOS_MODAL_ACKED);
        configstore.set("gemini", true);
        await ensureGIFApiTos(projectId);
        return true;
      case tos:
        analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GIF_TOS_MODAL_CLICKED);
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://firebase.google.com/docs/gemini-in-firebase#how-gemini-in-firebase-uses-your-data",
          ),
        );
      default:
        analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.GIF_TOS_MODAL_REJECTED);
        break;
    }
    return false;
  }

  return Disposable.from(
    { dispose: sub1 },
    { dispose: sub2 },
    { dispose: sub3 },
    { dispose: rerunExecutionBroker },
    registerWebview({
      name: "data-connect-execution-parameters",
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
      async (arg: ExecutionInput) => {
        await executeOperation(arg);
      },
    ),
    vscode.commands.registerCommand(
      "firebase.dataConnect.generateOperation",
      async (arg: GenerateOperationInput) => {
        await generateOperation(arg);
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

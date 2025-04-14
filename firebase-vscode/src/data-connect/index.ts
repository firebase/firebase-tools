import vscode, { Disposable, ExtensionContext, TelemetryLogger } from "vscode";
import { Signal, effect } from "@preact/signals-core";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution/execution";
import { registerExplorer } from "./explorer";
import { registerAdHoc } from "./ad-hoc-mutations";
import { DataConnectService as FdcService } from "./service";
import {
  ConfigureSdkCodeLensProvider,
  OperationCodeLensProvider,
  SchemaCodeLensProvider,
} from "./code-lens-provider";
import { registerConnectors } from "./connectors";
import { AuthService } from "../auth/service";
import { currentProjectId } from "../core/project";
import { isTest } from "../utils/env";
import { setupLanguageClient } from "./language-client";
import { EmulatorsController } from "../core/emulators";
import { registerFdcDeploy } from "./deploy";
import * as graphql from "graphql";
import {
  ResolvedDataConnectConfigs,
  dataConnectConfigs,
  registerDataConnectConfigs,
} from "./config";
import { locationToRange } from "../utils/graphql";
import { Result } from "../result";
import { LanguageClient } from "vscode-languageclient/node";
import { registerTerminalTasks } from "./terminal";
import { registerWebview } from "../webview";
import { DataConnectToolkit } from "./toolkit";
import { registerFdcSdkGeneration } from "./sdk-generation";
import { registerDiagnostics } from "./diagnostics";
import { AnalyticsLogger } from "../analytics";
import { emulators } from "../init/features";

class CodeActionsProvider implements vscode.CodeActionProvider {
  constructor(
    private configs: Signal<
      Result<ResolvedDataConnectConfigs | undefined> | undefined
    >,
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancellationToken: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const documentText = document.getText();
    const results: (vscode.CodeAction | vscode.Command)[] = [];

    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = graphql.parse(documentText);
    let definitionAtRange: graphql.DefinitionNode | undefined;
    let definitionIndex: number | undefined;

    for (let i = 0; i < documentNode.definitions.length; i++) {
      const definition = documentNode.definitions[i];

      if (
        definition.kind === graphql.Kind.OPERATION_DEFINITION &&
        definition.loc
      ) {
        const definitionRange = locationToRange(definition.loc);
        const line = definition.loc.startToken.line - 1;

        if (!definitionRange.intersection(range)) {
          continue;
        }

        definitionAtRange = definition;
        definitionIndex = i;
      }
    }

    if (!definitionAtRange) {
      return null;
    }

    this.moveToConnector(
      document,
      documentText,
      { index: definitionIndex! },
      results,
    );

    return results;
  }

  private moveToConnector(
    document: vscode.TextDocument,
    documentText: string,
    { index }: { index: number },
    results: (vscode.CodeAction | vscode.Command)[],
  ) {
    const enclosingService =
      this.configs.value?.tryReadValue?.findEnclosingServiceForPath(
        document.uri.fsPath,
      );
    if (!enclosingService) {
      return;
    }

    const enclosingConnector = enclosingService.findEnclosingConnectorForPath(
      document.uri.fsPath,
    );
    if (enclosingConnector) {
      // Already in a connector, don't suggest moving to another one
      return;
    }

    for (const connector of enclosingService.resolvedConnectors) {
      results.push({
        title: `Move to "${connector.value.connectorId}"`,
        kind: vscode.CodeActionKind.Refactor,
        tooltip: `Move to the connector to "${connector.path}"`,
        command: "firebase.dataConnect.moveOperationToConnector",
        arguments: [
          index,
          {
            document: documentText,
            documentPath: document.fileName,
          },
          connector.path,
        ],
      });
    }
  }
}

export function registerFdc(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl,
  authService: AuthService,
  emulatorController: EmulatorsController,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  registerDiagnostics(context, dataConnectConfigs);
  const dataConnectToolkit = new DataConnectToolkit(broker);

  const codeActions = vscode.languages.registerCodeActionsProvider(
    [
      { scheme: "file", language: "graphql" },
      { scheme: "untitled", language: "graphql" },
    ],
    new CodeActionsProvider(dataConnectConfigs),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.Refactor],
    },
  );

  const fdcService = new FdcService(
    authService,
    dataConnectToolkit,
    emulatorController,
  );

  // register codelens
  const operationCodeLensProvider = new OperationCodeLensProvider(
    emulatorController,
  );
  const schemaCodeLensProvider = new SchemaCodeLensProvider(emulatorController);
  const configureSdkCodeLensProvider = new ConfigureSdkCodeLensProvider();

  // activate FDC toolkit
  // activate language client/serer
  let client: LanguageClient;
  const lsOutputChannel: vscode.OutputChannel =
    vscode.window.createOutputChannel("Firebase GraphQL Language Server");

  // setup new language client on config change
  context.subscriptions.push({
    dispose: effect(() => {
      const configs = dataConnectConfigs.value?.tryReadValue;
      if (client) {
        client.stop();
      }
      if (configs && configs.values.length > 0) {
        client = setupLanguageClient(context, configs, lsOutputChannel);
        vscode.commands.executeCommand("fdc-graphql.start");
      }
    }),
  });

  const selectedProjectStatus = vscode.window.createStatusBarItem(
    "projectPicker",
    vscode.StatusBarAlignment.Left,
  );
  selectedProjectStatus.tooltip = "Select a Firebase project";
  selectedProjectStatus.command = "firebase.selectProject";

  const sub1 = effect(() => {
    // Enable FDC views only if at least one dataconnect.yaml is present.
    // TODO don't start the related logic unless a dataconnect.yaml is present
    vscode.commands.executeCommand(
      "setContext",
      "firebase-vscode.fdc.enabled",
      (dataConnectConfigs.value?.tryReadValue?.values.length ?? 0) !== 0,
    );
  });

  registerDataConnectConfigs(context, broker);

  return Disposable.from(
    dataConnectToolkit,
    codeActions,
    selectedProjectStatus,
    { dispose: sub1 },
    {
      dispose: effect(() => {
        selectedProjectStatus.text = `$(mono-firebase) ${
          currentProjectId.value ?? "<No project>"
        }`;
        selectedProjectStatus.show();
      }),
    },
    registerExecution(
      context,
      broker,
      fdcService,
      analyticsLogger,
      emulatorController,
    ),
    registerExplorer(context, broker, fdcService),
    registerWebview({ name: "data-connect", context, broker }),
    registerAdHoc(fdcService, analyticsLogger),
    registerConnectors(context, broker, fdcService, analyticsLogger),
    registerFdcDeploy(broker, analyticsLogger),
    registerFdcSdkGeneration(broker, analyticsLogger),
    registerTerminalTasks(broker, analyticsLogger),
    operationCodeLensProvider,
    vscode.languages.registerCodeLensProvider(
      // **Hack**: For testing purposes, enable code lenses on all graphql files
      // inside the test_projects folder.
      // This is because e2e tests start without graphQL installed,
      // so code lenses would otherwise never show up.
      isTest
        ? [{ pattern: "/**/firebase-vscode/src/test/test_projects/**/*.gql" }]
        : [
            { scheme: "file", language: "graphql" },
            { scheme: "untitled", language: "graphql" },
          ],
      operationCodeLensProvider,
    ),
    schemaCodeLensProvider,
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: "file", language: "graphql" },
        // Don't show in untitled files since the provider needs the file name.
      ],
      schemaCodeLensProvider,
    ),
    vscode.languages.registerCodeLensProvider(
      [{ scheme: "file", language: "yaml", pattern: "**/connector.yaml" }],
      configureSdkCodeLensProvider,
    ),
    {
      dispose: () => {
        client.stop();
      },
    },
  );
}

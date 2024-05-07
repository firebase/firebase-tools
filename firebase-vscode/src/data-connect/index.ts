import vscode, { Disposable, ExtensionContext } from "vscode";
import { Signal, effect } from "@preact/signals-core";
import { ExtensionBrokerImpl } from "../extension-broker";
import { registerExecution } from "./execution";
import { registerExplorer } from "./explorer";
import { registerAdHoc } from "./ad-hoc-mutations";
import { DataConnectService as FdcService } from "./service";
import {
  OperationCodeLensProvider,
  SchemaCodeLensProvider,
} from "./code-lens-provider";
import { registerConnectors } from "./connectors";
import { AuthService } from "../auth/service";
import { registerFirebaseDataConnectView } from "./emulators-status";
import { currentProjectId } from "../core/project";
import { isTest } from "../utils/env";
import { setupLanguageClient } from "./language-client";
import { EmulatorsController } from "../core/emulators";
import { registerFdcDeploy } from "./deploy";
import * as graphql from "graphql";
import {
  ResolvedDataConnectConfigs,
  VSCODE_ENV_VARS,
  dataConnectConfigs,
  registerDataConnectConfigs,
} from "./config";
import { locationToRange } from "../utils/graphql";
import { runDataConnectCompiler } from "./core-compiler";
import { setVSCodeEnvVars } from "../../../src/utils";
import { Result } from "../result";
import { setTerminalEnvVars } from "./terminal";
import { runEmulatorIssuesStream } from "./emulator-stream";

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

    for (const connectorResult of enclosingService.resolvedConnectors) {
      const connector = connectorResult.tryReadValue;
      if (!connector) {
        // Parsing error in the connector, skip
        continue;
      }

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
): Disposable {
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

  const fdcService = new FdcService(authService, emulatorController);
  const operationCodeLensProvider = new OperationCodeLensProvider(
    emulatorController,
  );
  const schemaCodeLensProvider = new SchemaCodeLensProvider(emulatorController);

  const client = setupLanguageClient(context);
  client.start();

  // Perform some side-effects when the endpoint changes
  context.subscriptions.push({
    dispose: effect(() => {
      const configs = dataConnectConfigs.value?.tryReadValue;

      if (configs && fdcService.localEndpoint.value) {
        // TODO move to client.start or setupLanguageClient
        vscode.commands.executeCommand("fdc-graphql.restart");

        vscode.commands.executeCommand(
          "firebase.dataConnect.executeIntrospection",
        );
        runEmulatorIssuesStream(configs,fdcService.localEndpoint.value);
        runDataConnectCompiler(configs, fdcService.localEndpoint.value);
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

  return Disposable.from(
    codeActions,
    selectedProjectStatus,
    {dispose: sub1},
    {
      dispose: effect(() => {
        selectedProjectStatus.text = `$(mono-firebase) ${
          currentProjectId.value ?? "<No project>"
        }`;
        selectedProjectStatus.show();
      }),
    },
    registerDataConnectConfigs(),
    registerExecution(context, broker, fdcService, emulatorController),
    registerExplorer(context, broker, fdcService),
    registerFirebaseDataConnectView(context, broker, emulatorController),
    registerAdHoc(context, broker),
    registerConnectors(context, broker, fdcService),
    registerFdcDeploy(broker),
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
    {
      dispose: () => {
        client.stop();
      },
    },
  );
}

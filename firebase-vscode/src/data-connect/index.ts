import vscode, { Disposable, ExtensionContext } from "vscode";
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
import { locationToRange, unwrapTypeName } from "../utils/graphql";
import { Result } from "../result";
import { LanguageClient } from "vscode-languageclient/node";
import { registerTerminalTasks } from "./terminal";
import { registerWebview } from "../webview";
import { DataConnectToolkit } from "./toolkit";
import { registerFdcSdkGeneration } from "./sdk-generation";
import { registerDiagnostics } from "./diagnostics";
import { AnalyticsLogger } from "../analytics";
import { registerFirebaseMCP } from "./ai-tools/firebase-mcp";
import { ExecutionParamsService } from "./execution/execution-params";
import { AllowDirectiveService } from "./allow-directive-service";
import { AllowDirectiveCompletionProvider } from "./allow-directive-completion";

class CodeActionsProvider implements vscode.CodeActionProvider {
  constructor(
    private configs: Signal<
      Result<ResolvedDataConnectConfigs | undefined> | undefined
    >,
    private allowService: AllowDirectiveService,
  ) { }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancellationToken: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const documentText = document.getText();
    const results: (vscode.CodeAction | vscode.Command)[] = [];

    // TODO: replace w/ online-parser to work with malformed documents
    let documentNode;
    try {
      documentNode = graphql.parse(documentText);
    } catch {
      return null;
    }
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

    // Add @allow quick fix for mutations with _Data variables missing @allow.
    if (definitionAtRange.kind === graphql.Kind.OPERATION_DEFINITION) {
      this.addAllowQuickFix(
        document,
        definitionAtRange as graphql.OperationDefinitionNode,
        results,
      );
    }

    return results;
  }

  private addAllowQuickFix(
    document: vscode.TextDocument,
    def: graphql.OperationDefinitionNode,
    results: (vscode.CodeAction | vscode.Command)[],
  ): void {
    if (def.operation !== graphql.OperationTypeNode.MUTATION) {
      return;
    }

    // Check each _Data variable for a missing @allow.
    for (const varDef of def.variableDefinitions ?? []) {
      const typeName = unwrapTypeName(varDef.type);
      if (!typeName.endsWith("_Data")) {
        continue;
      }

      const hasAllow = varDef.directives?.some(
        (d) => d.name.value === "allow",
      );
      if (hasAllow) {
        continue;
      }

      // Initialize service for this file's config.
      try {
        const serviceConfig =
          this.configs.value?.tryReadValue?.findEnclosingServiceForPath(
            document.uri.fsPath,
          );
        if (!serviceConfig) {
          return;
        }
        this.allowService.initialize(serviceConfig);
      } catch {
        return;
      }

      const shallowFields = this.allowService.getShallowFields(typeName);
      if (!shallowFields.length) {
        continue;
      }

      const fieldsStr = shallowFields.join(" ");
      const allowText = `\n  @allow(fields: "${fieldsStr}")`;

      // Insert after the variable's type annotation.
      if (!varDef.type.loc) {
        continue;
      }
      const insertPos = document.positionAt(varDef.type.loc.end);

      const action = new vscode.CodeAction(
        `Add @allow with all DB columns for $${varDef.variable.name.value}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.edit = new vscode.WorkspaceEdit();
      action.edit.insert(document.uri, insertPos, allowText);
      action.isPreferred = true;
      results.push(action);
    }
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
  paramsService: ExecutionParamsService,
  emulatorController: EmulatorsController,
  analyticsLogger: AnalyticsLogger,
): Disposable {
  registerDiagnostics(context, dataConnectConfigs);
  const dataConnectToolkit = new DataConnectToolkit(broker);
  const allowService = new AllowDirectiveService();

  // Register @allow directive completion provider.
  const allowCompletionProvider =
    vscode.languages.registerCompletionItemProvider(
      [{ scheme: "file", language: "graphql" }],
      new AllowDirectiveCompletionProvider(allowService),
      '"',
      " ",
      "{",
    );

  // Watch for generated schema file changes to invalidate the allow service cache.
  const generatedSchemaWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.dataconnect/schema/**/*.gql",
  );
  const invalidateAllowCache = () => allowService.invalidateCache();
  generatedSchemaWatcher.onDidChange(invalidateAllowCache);
  generatedSchemaWatcher.onDidCreate(invalidateAllowCache);
  generatedSchemaWatcher.onDidDelete(invalidateAllowCache);

  // Diagnostic collection for missing @allow on mutations.
  const allowDiagnostics =
    vscode.languages.createDiagnosticCollection("fdc-allow-directive");
  const updateAllowDiagnostics = (document: vscode.TextDocument) => {
    if (document.languageId !== "graphql") {
      return;
    }
    computeAllowDiagnostics(document, allowService, allowDiagnostics);
  };
  // Update diagnostics on open, save, and change (debounced on change).
  let diagnosticDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateAllowDiagnostics),
    vscode.workspace.onDidSaveTextDocument(updateAllowDiagnostics),
    vscode.workspace.onDidChangeTextDocument((e) => {
      clearTimeout(diagnosticDebounceTimer);
      diagnosticDebounceTimer = setTimeout(
        () => updateAllowDiagnostics(e.document),
        300,
      );
    }),
    allowDiagnostics,
  );

  const codeActions = vscode.languages.registerCodeActionsProvider(
    [
      { scheme: "file", language: "graphql" },
      { scheme: "untitled", language: "graphql" },
    ],
    new CodeActionsProvider(dataConnectConfigs, allowService),
    {
      providedCodeActionKinds: [
        vscode.CodeActionKind.Refactor,
        vscode.CodeActionKind.QuickFix,
      ],
    },
  );

  const fdcService = new FdcService(
    dataConnectToolkit,
    emulatorController,
    analyticsLogger,
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
        selectedProjectStatus.text = `$(mono-firebase) ${currentProjectId.value ?? "<No project>"
          }`;
        selectedProjectStatus.show();
      }),
    },
    registerExecution(
      context,
      broker,
      fdcService,
      paramsService,
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
    registerFirebaseMCP(broker, analyticsLogger),
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
    allowCompletionProvider,
    generatedSchemaWatcher,
    {
      dispose: () => {
        client.stop();
      },
    },
  );
}

/**
 * Compute diagnostics for mutations missing @allow directives.
 * Shows an informational hint when a mutation has _Data variables but no @allow.
 */
function computeAllowDiagnostics(
  document: vscode.TextDocument,
  allowService: AllowDirectiveService,
  collection: vscode.DiagnosticCollection,
): void {
  let ast;
  try {
    ast = graphql.parse(document.getText());
  } catch {
    // Can't parse — clear diagnostics for this file.
    collection.delete(document.uri);
    return;
  }

  // Initialize the service for this file if possible.
  const configs = dataConnectConfigs.value?.tryReadValue;
  if (!configs) {
    collection.delete(document.uri);
    return;
  }
  try {
    const serviceConfig = configs.findEnclosingServiceForPath(
      document.fileName,
    );
    allowService.initialize(serviceConfig);
  } catch {
    collection.delete(document.uri);
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  for (const def of ast.definitions) {
    if (def.kind !== graphql.Kind.OPERATION_DEFINITION) {
      continue;
    }
    if (def.operation !== graphql.OperationTypeNode.MUTATION) {
      continue;
    }

    // Flag each _Data variable missing @allow.
    for (const varDef of def.variableDefinitions ?? []) {
      const typeName = unwrapTypeName(varDef.type);
      if (!typeName.endsWith("_Data")) {
        continue;
      }
      const hasAllow = varDef.directives?.some(
        (d) => d.name.value === "allow",
      );
      if (hasAllow) {
        continue;
      }
      if (!varDef.loc) {
        continue;
      }

      const range = locationToRange(varDef.loc);
      const diagnostic = new vscode.Diagnostic(
        range,
        `Missing @allow directive on $${varDef.variable.name.value}. Required for deployment (optional for local emulator).`,
        vscode.DiagnosticSeverity.Information,
      );
      diagnostic.source = "Firebase SQL Connect";
      diagnostics.push(diagnostic);
    }
  }

  collection.set(document.uri, diagnostics);
}

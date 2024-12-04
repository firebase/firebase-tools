import * as vscode from "vscode";
import { Kind, parse } from "graphql";
import { OperationLocation } from "./types";
import { Disposable } from "vscode";

import { Signal } from "@preact/signals-core";
import { dataConnectConfigs, firebaseRC } from "./config";
import { EmulatorsController } from "../core/emulators";

export enum InstanceType {
  LOCAL = "local",
  PRODUCTION = "production",
}

abstract class ComputedCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  onDidChangeCodeLenses = this._onChangeCodeLensesEmitter.event;

  private readonly subscriptions: Map<Signal<any>, Disposable> = new Map();

  watch<T>(signal: Signal<T>): T {
    if (!this.subscriptions.has(signal)) {
      let initialFire = true;
      const disposable = signal.subscribe(() => {
        // Signals notify their listeners immediately, even if no change were detected.
        // This is undesired here as such notification would be picked up by vscode,
        // triggering an infinite reload loop of the codelenses.
        // We therefore skip this notification and only keep actual "change" notifications
        if (initialFire) {
          initialFire = false;
          return;
        }

        this._onChangeCodeLensesEmitter.fire();
      });

      this.subscriptions.set(signal, { dispose: disposable });
    }

    return signal.peek();
  }

  refresh() {
    this._onChangeCodeLensesEmitter.fire();
  }

  dispose() {
    for (const disposable of this.subscriptions.values()) {
      disposable.dispose();
    }
    this.subscriptions.clear();
  }

  abstract provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[];
}

/**
 * CodeLensProvider provides codelens for actions in graphql files.
 */
export class OperationCodeLensProvider extends ComputedCodeLensProvider {
  constructor(readonly emulatorsController: EmulatorsController) {
    super();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    // Wait for configs to be loaded and emulator to be running
    const fdcConfigs = this.watch(dataConnectConfigs)?.tryReadValue;
    const rc = this.watch(firebaseRC)?.tryReadValue;
    if (!fdcConfigs || !rc) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    const documentText = document.getText();
    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = parse(documentText);

    for (let i = 0; i < documentNode.definitions.length; i++) {
      const x = documentNode.definitions[i];
      if (x.kind === Kind.OPERATION_DEFINITION && x.loc) {
        const line = x.loc.startToken.line - 1;
        const range = new vscode.Range(line, 0, line, 0);
        const position = new vscode.Position(line, 0);
        const operationLocation: OperationLocation = {
          document: documentText,
          documentPath: document.fileName,
          position: position,
        };
        const service = fdcConfigs.findEnclosingServiceForPath(
          document.fileName,
        );

        if (service) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(play) Run (local)`,
              command: "firebase.dataConnect.executeOperation",
              tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
              arguments: [x, operationLocation, InstanceType.LOCAL],
            }),
          );

          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(play) Run (Production – Project: ${rc.projects.default})`,
              command: "firebase.dataConnect.executeOperation",
              tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
              arguments: [x, operationLocation, InstanceType.PRODUCTION],
            }),
          );
        }
      }
    }

    return codeLenses;
  }
}

/**
 * CodeLensProvider for actions on the schema file
 */
export class SchemaCodeLensProvider extends ComputedCodeLensProvider {
  constructor(readonly emulatorsController: EmulatorsController) {
    super();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];

    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = parse(document.getText());

    for (const x of documentNode.definitions) {
      if (x.kind === Kind.OBJECT_TYPE_DEFINITION && x.loc) {
        const line = x.loc.startToken.line - 1;
        const range = new vscode.Range(line, 0, line, 0);
        const documentPath = document.fileName;

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(database) Add data`,
            command: "firebase.dataConnect.schemaAddData",
            tooltip: "Generate a mutation to add data of this type",
            arguments: [x, documentPath],
          }),
        );

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(database) Read data`,
            command: "firebase.dataConnect.schemaReadData",
            tooltip: "Generate a query to read data of this type",
            arguments: [documentNode, x, documentPath],
          }),
        );
      }
    }

    return codeLenses;
  }
}
/**
 * CodeLensProvider for Configure SDK in Connector.yaml
 */
export class ConfigureSdkCodeLensProvider extends ComputedCodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    // Wait for configs to be loaded
    const fdcConfigs = this.watch(dataConnectConfigs)?.tryReadValue;
    const rc = this.watch(firebaseRC)?.tryReadValue;
    if (!fdcConfigs || !rc) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const range = new vscode.Range(0, 0, 0, 0);
    const serviceConfig = fdcConfigs.findEnclosingServiceForPath(
      document.fileName,
    );
    const connectorConfig = serviceConfig!.findEnclosingConnectorForPath(
      document.fileName,
    );
    if (serviceConfig) {
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `$(tools) Configure Generated SDK`,
          command: "fdc.connector.configure-sdk",
          tooltip: "Configure a generated SDK for this connector",
          arguments: [connectorConfig],
        }),
      );
    }

    return codeLenses;
  }
}

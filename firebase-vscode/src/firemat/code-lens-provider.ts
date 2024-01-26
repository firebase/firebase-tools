import * as vscode from "vscode";
import { Kind, parse } from "graphql";
import { OperationLocation } from "./types";
import { Disposable } from "vscode";

import { isFirematEmulatorRunning } from "../core/emulators";
import { Signal, computed } from "@preact/signals-core";
import { firematConfig } from "../core/config";
import path from "path";

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

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * CodeLensProvider provides codelens for actions in graphql files.
 */
export class OperationCodeLensProvider extends ComputedCodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    // Wait for configs to be loaded and emulator to be running
    const configs = this.watch(firematConfig);
    if (!configs || !this.watch(isFirematEmulatorRunning)) {
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
        const opKind = x.operation as string; // query or mutation
        const schemaPath = configs.schema.main.source;

        if (isPathInside(document.fileName, schemaPath)) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(play) Execute ${opKind}`,
              command: "firebase.firemat.executeOperation",
              tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
              arguments: [x, operationLocation],
            }),
          );
        }

        const connectorPath = configs.operationSet.crud.source;
        if (!isPathInside(document.fileName, connectorPath)) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(plug) Move to connector`,
              command: "firebase.firemat.moveOperationToConnector",
              tooltip: `Expose this ${opKind} to client apps through the SDK.`,
              arguments: [i, operationLocation],
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
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    if (!this.watch(isFirematEmulatorRunning)) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = parse(document.getText());

    for (const x of documentNode.definitions) {
      if (x.kind === Kind.OBJECT_TYPE_DEFINITION && x.loc) {
        const line = x.loc.startToken.line - 1;
        const range = new vscode.Range(line, 0, line, 0);
        const position = new vscode.Position(line, 0);
        const schemaLocation = {
          documentPath: document.fileName,
          position: position,
        };

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(database) Add data`,
            command: "firebase.firemat.schemaAddData",
            tooltip: "Generate a mutation to add data of this type",
            arguments: [x, schemaLocation],
          }),
        );
      }
    }

    return codeLenses;
  }
}

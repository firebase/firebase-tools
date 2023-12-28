import * as vscode from "vscode";
import { Kind, parse } from "graphql";
import { OPERATION_TYPE, OperationLocation } from "./types";

import { isFirematEmulatorRunning } from "../core/emulators";
/**
 * CodeLensProvider provides codelens for actions in graphql files.
 */
export class OperationCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
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
        if (isFirematEmulatorRunning.value) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(play) Execute ${opKind}`,
              command: "firebase.firemat.executeOperation",
              tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
              arguments: [x, operationLocation],
            })
          );

          // HACK: This assumes the connector is in a directory called
          // "connector" and anything else is not in a connector.
          // TODO: Parse firemat.yaml for the actual connector paths.
          if (!document.fileName.includes("/connector/")) {
            codeLenses.push(
              new vscode.CodeLens(range, {
                title: `$(plug) Move to connector`,
                command: "firebase.firemat.moveOperationToConnector",
                tooltip: `Expose this ${opKind} to client apps through the SDK.`,
                arguments: [i, operationLocation],
              })
            );
          }
        }
      }
    }

    return codeLenses;
  }
}

/**
 * CodeLensProvider for actions on the schema file
 */
export class SchemaCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
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

        if (isFirematEmulatorRunning.value) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `$(database) Add data`,
              command: "firebase.firemat.schemaAddData",
              tooltip: "Generate a mutation to add data of this type",
              arguments: [x, schemaLocation],
            })
          );
        }
      }
    }

    return codeLenses;
  }
}

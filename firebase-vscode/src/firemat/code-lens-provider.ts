import * as vscode from "vscode";
import { Kind, parse } from "graphql";
import { OPERATION_TYPE } from "./types";
/**
 * CodeLensProvider provides codelens for actions in graphql files.
 */
export class CodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    const documentText = document.getText();

    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = parse(documentText);

    for (const x of documentNode.definitions) {
      if (x.kind === Kind.OPERATION_DEFINITION && x.loc) {
        const line = x.loc.startToken.line - 1;
        const range = new vscode.Range(line, 0, line, 0);
        const position = new vscode.Position(line, 0);
        const operationLocation = {
          document: documentText,
          documentPath: document.fileName,
          position: position,
        };

        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(play) Execute ${x.operation as string}`,
            command: "firebase.firemat.executeOperation",
            tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
            arguments: [
              x,
              operationLocation,
            ],
          })
        );
      }
    }

    return codeLenses;
  }
}

import * as vscode from "vscode";

import { Kind, parse } from "graphql";

/**
 * CodeLensProvider provides codelens for actions in graphql files.
 */
export class CodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    // TODO: replace w/ online-parser to work with malformed documents
    const documentNode = parse(document.getText());

    for (const x of documentNode.definitions) {
      if (x.kind === Kind.OPERATION_DEFINITION && x.loc) {
        const line = x.loc.startToken.line - 1;
        const range = new vscode.Range(line, 0, line, 0);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `$(play) Execute ${
              x.operation === "query" ? "query" : "mutation"
            }`,
            command: "firebase.firemat.executeOperation",
            tooltip: "Execute the operation (⌘+enter or Ctrl+Enter)",
            arguments: [],
          })
        );
      }
    }

    return codeLenses;
  }
}

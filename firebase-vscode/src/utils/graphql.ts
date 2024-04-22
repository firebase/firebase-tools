import * as graphql from "graphql";
import * as vscode from "vscode";

export function locationToRange(location: graphql.Location): vscode.Range {
  // -1 because Range uses 0-based indexing but Location uses 1-based indexing
  return new vscode.Range(
    location.startToken.line - 1,
    location.startToken.column - 1,
    location.endToken.line - 1,
    location.endToken.column - 1
  );
}

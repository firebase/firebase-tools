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

/** Unwrap NonNull / List type wrappers to get the named type string. */
export function unwrapTypeName(type: graphql.TypeNode): string {
  if (type.kind === graphql.Kind.NON_NULL_TYPE) {
    return unwrapTypeName(type.type);
  }
  if (type.kind === graphql.Kind.LIST_TYPE) {
    return unwrapTypeName(type.type);
  }
  return type.name.value;
}

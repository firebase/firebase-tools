import * as vscode from "vscode";

export enum OPERATION_TYPE {
  query = "query",
  mutation = "mutation",
}

export interface OperationLocation {
  document: string;
  documentPath: string;
  position: vscode.Position;
}

import * as vscode from "vscode";

/// A value wrapper for mocking purposes.
export type Ref<T> = { value: T };

export type Workspace = typeof vscode.workspace;
export const workspace: Ref<Workspace> = { value: vscode.workspace };

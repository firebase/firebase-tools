import { effect, Signal } from "@preact/signals-core";
import * as vscode from "vscode";
import { Result } from "../result";
import {
  DataConnectConfigsError,
  DataConnectConfigsValue,
  ErrorWithPath,
} from "./config";

export function registerDiagnostics(
  context: vscode.ExtensionContext,
  dataConnectConfigs: Signal<
    | Result<DataConnectConfigsValue | undefined, DataConnectConfigsError>
    | undefined
  >,
) {
  const collection =
    vscode.languages.createDiagnosticCollection("data-connect");
  context.subscriptions.push(collection);

  context.subscriptions.push({
    dispose: effect(() => {
      collection.clear();

      const fdcConfigsValue = dataConnectConfigs.value;
      fdcConfigsValue?.switchCase(
        (_) => {
          // Value. No-op as we're only dealing with errors here
        },
        (fdcError) => {
          const error = fdcError.error;

          collection.set(vscode.Uri.file(fdcError.path!), [
            new vscode.Diagnostic(
              error instanceof ErrorWithPath
                ? error.range
                : new vscode.Range(0, 0, 0, 0),
              error instanceof Error ? error.message : `${error}`,
              vscode.DiagnosticSeverity.Error,
            ),
          ]);
        },
      );
    }),
  });
}

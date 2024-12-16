import { effect } from "@preact/signals-core";
import * as vscode from "vscode";
import { SessionProvider } from "./session-provider";
import { currentUser } from "../core/user";
import { currentProjectId } from "../core/project";

export function registerSession(): vscode.Disposable {
  const sessionProvider = new SessionProvider();

  return vscode.Disposable.from(
    {
      dispose: effect(() => {
        sessionProvider.updateEmail(currentUser.value?.email);
      }),
    },
    {
      dispose: effect(() => {
        sessionProvider.updateProjectId(currentProjectId.value);
      }),
    },
    vscode.window.createTreeView("firebase.session", {
      treeDataProvider: sessionProvider,
    }),
  );
}

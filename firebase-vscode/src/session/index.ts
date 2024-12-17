import { effect, ReadonlySignal } from "@preact/signals-core";
import * as vscode from "vscode";
import { SessionProvider } from "./session-provider";
import { checkLogin, User } from "../core/user";
import { currentProjectId } from "../core/project";

export function registerSession(
  user: ReadonlySignal<User | undefined>,
  project: ReadonlySignal<string | undefined>,
): vscode.Disposable {
  const sessionProvider = new SessionProvider();

  return vscode.Disposable.from(
    {
      dispose: effect(() => {
        sessionProvider.updateEmail(user.value?.email);
      }),
    },
    {
      dispose: effect(() => {
        sessionProvider.updateProjectId(project.value);
        console.log("project.value", project.value);
      }),
    },
    vscode.window.createTreeView("firebase.session", {
      treeDataProvider: sessionProvider,
    }),
  );
}

import { Workbench } from "wdio-vscode-service";

export class StatusBar {
  constructor(readonly workbench: Workbench) {}

  get currentInstanceElement() {
    return $('[id="firebase.firebase-vscode.instancePicker"]');
  }

  get currentProjectElement() {
    return $('[id="firebase.firebase-vscode.projectPicker"]');
  }
}

/* Workaround to workbench not exposing a way to get an InputBox
 * without triggering a command. */
export async function findQuickPicks() {
  // TODO find a way to use InputBox manually that does not trigger a build error
  return await $(".quick-input-widget")
    .$(".quick-input-list")
    .$(".monaco-list-rows")
    .$$(".monaco-list-row");
}

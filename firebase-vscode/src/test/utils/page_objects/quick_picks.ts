import { Workbench } from "wdio-vscode-service";

/* Workaround to workbench not exposing a way to get an InputBox
 * without triggering a command. */

export class QuickPick {
  constructor(readonly workbench: Workbench) {}

  get okElement() {
    return $("a=OK");
  }

  async findQuickPicks() {
    // TODO find a way to use InputBox manually that does not trigger a build error
    return await $(".quick-input-widget")
      .$(".quick-input-list")
      .$(".monaco-list-rows")
      .$$(".monaco-list-row");
  }
}

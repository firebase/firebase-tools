import * as vscode from "vscode";
import { Workbench } from "wdio-vscode-service";
import { addTearDown } from "../test_hooks";

export class EditorView {
  constructor(readonly workbench: Workbench) {}

  private readonly editorView = this.workbench.getEditorView();

  get firstCodeLense() {
    return this.editorView.elem.$(".codelens-decoration");
  }

  get codeLensesElements() {
    return this.editorView.elem.$$(".codelens-decoration");
  }

  async openFile(path: string) {
    // TODO - close opened editors after tests
    return browser.executeWorkbench(async (vs: typeof vscode, path) => {
      const doc = await vs.workspace.openTextDocument(path);

      return vs.window.showTextDocument(doc, 1, false);
    }, path);
  }
}

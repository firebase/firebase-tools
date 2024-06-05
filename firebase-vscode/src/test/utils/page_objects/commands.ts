import * as vscode from "vscode";
import { addTearDown } from "../test_hooks";

export class FirebaseCommands {
  async waitEmulators() {
    await browser.executeWorkbench(async (vs: typeof vscode) => {
      return vs.commands.executeCommand("firebase.emulators.wait");
    });
  }
}

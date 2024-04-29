import * as vscode from "vscode";
import { addTearDown } from "../test_hooks";

export class FirebaseCommands {
  async startEmulators() {
    await browser.executeWorkbench(async (vs: typeof vscode) => {
      return vs.commands.executeCommand("firebase.emulators.start");
    });

    // Stop emulators after tests to ensure follow-up tests
    // start from a clean slate
    addTearDown(() => this.stopEmulators());
  }

  async stopEmulators() {
    await browser.executeWorkbench(async (vs: typeof vscode) => {
      return vs.commands.executeCommand("firebase.emulators.stop");
    });
  }
}

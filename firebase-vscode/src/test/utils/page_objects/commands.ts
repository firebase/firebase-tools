import * as vscode from "vscode";
import { EmulatorsStatus, RunningEmulatorInfo } from "../../../messaging/types";

export class FirebaseCommands {
  async waitEmulators() {
    await browser.executeWorkbench(async (vs: typeof vscode) => {
      return vs.commands.executeCommand("firebase.emulators.wait");
    });
  }

  async findRunningEmulators(): Promise<
    { status: EmulatorsStatus; infos?: RunningEmulatorInfo } | undefined
  > {
    return browser.executeWorkbench(async (vs: typeof vscode) => {
      const emulators = await vs.commands.executeCommand(
        "firebase.emulators.findRunning",
      );
      return emulators as
        | { status: EmulatorsStatus; infos?: RunningEmulatorInfo }
        | undefined;
    });
  }
}

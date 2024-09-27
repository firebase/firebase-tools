import * as vscode from "vscode";
import { EmulatorsStatus, RunningEmulatorInfo } from "../../../messaging/types";

export class FirebaseCommands {
  async waitForEmulators(): Promise<void> {
    const response = await browser.executeWorkbench(
      async (vs: typeof vscode) => {
        const emulators = await vs.commands.executeCommand(
          "firebase.emulators.findRunning",
        );
        return emulators as
          | { status: EmulatorsStatus; infos?: RunningEmulatorInfo }
          | undefined;
      },
    );

    // Wait for the emulators to be started
    if (response?.status !== "running") {
      await browser.pause(1000);
      await this.waitForEmulators();
    } else {
      return;
    }
  }
}

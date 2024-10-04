import * as vscode from "vscode";
import { EmulatorsStatus, RunningEmulatorInfo } from "../../../messaging/types";
import { waitForTaskCompletion } from "../task";
// import { browser } from "@wdio/globals";
export class FirebaseCommands {
  private async getEmulatorsStatus() {
    return browser.executeWorkbench(async (vs: typeof vscode) => {
      const emulators = await vs.commands.executeCommand(
        "firebase.emulators.findRunning",
      );
      return emulators as
        | { status: EmulatorsStatus; infos?: RunningEmulatorInfo }
        | undefined;
    });
  }

  async waitForEmulators(): Promise<void> {
    return browser.waitUntil(
      async () => {
        const emulators = await this.getEmulatorsStatus();
        await browser.pause(1000);
        return emulators?.status === "running";
      },
      { timeout: 120000 },
    );
  }

  async waitForUser(): Promise<void> {
    return browser.waitUntil(async () => {
      return browser.executeWorkbench<void>(async (vs: typeof vscode) => {
        const isLoading = await vs.commands.executeCommand("fdc-graphql.user");
        console.log("User loading", isLoading);
        return true;
      });
    });
  }
}

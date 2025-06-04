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
        console.log("Emulators status", emulators);
        return emulators?.status === "running";
      },
      { timeout: 60000 },
    );
  }

  async waitForEmulatorsStopped(): Promise<void> {
    return browser.waitUntil(
      async () => {
        const emulators = await this.getEmulatorsStatus();
        await browser.pause(1000);
        console.log("Emulators status", emulators);
        return emulators?.status === "stopped";
      },
      { timeout: 10000 },
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

  async setConfigToSkipFolderSelection(): Promise<void> {
    await browser.executeWorkbench(async (vs: typeof vscode) => {
      // Retrieve the existing configuration for "firebase.dataConnect"
      const configs = vs.workspace.getConfiguration("firebase.dataConnect");

      // Update the configuration with new values
      await configs.update(
        "skipToAppFolderSelect",
        true,
        vs.ConfigurationTarget.Workspace,
      );
    });
  }
}

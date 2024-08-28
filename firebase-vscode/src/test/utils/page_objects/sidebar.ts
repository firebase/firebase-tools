import { Workbench } from "wdio-vscode-service";
import { runWebviewWithTitle, runInFrame } from "../webviews";
import * as vscode from "vscode";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async open() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand("fdc_sidebar.focus");
    });
  }

  get hostBtn() {
    return $("vscode-button=Host your Web App");
  }

  get startEmulatorBtn() {
    return $("vscode-button=Launch Data Connect emulator");
  }

  get stopEmulatorBtn() {
    return $("vscode-button=Click to stop the emulators");
  }

  get fdcDeployElement() {
    return $(".codicon-cloud-upload");
  }

  /** Starts the emulators and waits for the emulators to be started.
   *
   * This starts emulators by clicking on the button instead of using
   * the command.
   */
  async startEmulators() {
    await this.open();

    await this.runInFirebaseViewContext(async () => {
      await this.startEmulatorBtn.click();

      // Wait for the emulators to be started
      await this.stopEmulatorBtn.waitForDisplayed();
    });
  }

  /** Runs the callback in the context of the Firebase view, within the sidebar */
  async runInFirebaseViewContext(
    cb: (firebase: FirebaseView) => Promise<void>,
  ): Promise<void> {
    await runWebviewWithTitle("Config", async () => {
      await cb(new FirebaseView(this.workbench));
    });
  }
}

export class FirebaseView {
  constructor(readonly workbench: Workbench) {}

  get userIconElement() {
    return $(".codicon-account");
  }

  get connectProjectLinkElement() {
    return $("vscode-link=Connect a Firebase project");
  }

  get openFolderElement() {
    return $("vscode-button=Open folder");
  }
}

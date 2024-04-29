import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";
import * as vscode from "vscode";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async open() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand(
        "firebase.dataConnect.explorerView.focus"
      );
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
  async runInFirebaseViewContext<R>(
    cb: (firebase: FirebaseView) => Promise<R>
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Config");

    return runInFrame(a, () =>
      runInFrame(b, () => cb(new FirebaseView(this.workbench)))
    );
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
}

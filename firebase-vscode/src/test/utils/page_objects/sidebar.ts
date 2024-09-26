import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";
import { TEXT } from "../../../../webviews/globals/ux-text";
import vscode from "vscode";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async open() {
    await $("a.codicon-mono-firebase").click();
    // await browser.executeWorkbench((vs: typeof vscode) => {
    //   return vs.commands.executeCommand(
    //     "firebase.dataConnect.explorerView.focus",
    //   );
    // });
  }

  get hostBtn() {
    return $("vscode-button=Host your Web App");
  }

  get stopEmulatorBtn() {
    return $("vscode-button=Click to stop the emulators");
  }

  get fdcDeployElement() {
    return $("vscode-button=Deploy");
  }

  async focusFdcExplorer() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand(
        "firebase.dataConnect.explorerView.focus",
      );
    });
  }

  /** Starts the emulators and waits for the emulators to be started.
   *
   * This starts emulators by clicking on the button instead of using
   * the command.
   */
  async startEmulators() {
    await this.open();

    await this.runInConfigContext(async () => {
      // await this.startEmulatorBtn.click();

      // Wait for the emulators to be started
      await this.stopEmulatorBtn.waitForDisplayed();
    });
  }

  get fdcExplorerView() {
    return $("firebase.dataConnect.explorerView");
  }

  /** Runs the callback in the context of the Firebase view, within the sidebar */
  async runInConfigContext<R>(
    cb: (firebase: ConfigView) => Promise<R>,
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Config");

    return runInFrame(a, () =>
      runInFrame(b, () => cb(new ConfigView(this.workbench))),
    );
  }

  /** Runs the callback in the context of the Firebase view, within the sidebar */
  async runInFDCViewContext<R>(
    cb: (firebase: FDCView) => Promise<R>,
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Firebase Data Connect");

    return runInFrame(a, () =>
      runInFrame(b, () => cb(new FDCView(this.workbench))),
    );
  }
}

export class ConfigView {
  constructor(readonly workbench: Workbench) {}

  get userIconElement() {
    return $(".codicon-account");
  }

  get signInWithGoogleLink() {
    return $(`vscode-link=${TEXT.GOOGLE_SIGN_IN}`);
  }

  get startEmulatorsBtn() {
    return $("vscode-button=Start emulators");
  }
}

export class FDCView {
  constructor(readonly workbench: Workbench) {}

  get startEmulatorBtn() {
    return $("vscode-button=Connect to Local PostgreSQL");
  }
}

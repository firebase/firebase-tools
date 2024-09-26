import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";
import { TEXT } from "../../../../webviews/globals/ux-text";
import vscode from "vscode";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async open() {
    await $("a.codicon-mono-firebase").click();
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

  /** Runs the callback in the context of the Firebase view, within the sidebar */
  async runInConfigContext<R>(
    cb: (firebase: ConfigView) => Promise<R>,
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Config");

    return runInFrame(a, () =>
      runInFrame(b, () => cb(new ConfigView(this.workbench))),
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

  get fdcExplorerView() {
    return $('div[aria-label="FDC Explorer"] .monaco-list-rows');
  }

  async focusFdcExplorer() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand(
        "firebase.dataConnect.explorerView.focus",
      );
    });
  }

  async waitForData() {
    await this.fdcExplorerView.waitForDisplayed();
  }

  async getQueries() {
    const explorerView = await this.fdcExplorerView;
    const query = await explorerView.$(
      `div.monaco-list-row[aria-label*="query"]`,
    );

    // Select all the queries
    await query.waitForDisplayed();
    await query.click();

    const queries = explorerView.$$(`div.monaco-list-row[aria-level="2"]`);
    await browser.pause(500);

    // Close the query list
    await query.click();

    return queries;
  }

  async getMutations() {
    const explorerView = await this.fdcExplorerView;
    const mutation = await explorerView.$(
      `div.monaco-list-row[aria-label*="mutation"]`,
    );

    // Select all the queries
    await mutation.waitForDisplayed();
    await mutation.click();
    const mutations = explorerView.$$(`div.monaco-list-row[aria-level="2"]`);
    await browser.pause(500);

    // Close the mutation list
    await mutation.click();

    return mutations;
  }
}

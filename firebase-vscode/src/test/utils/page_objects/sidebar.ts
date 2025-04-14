import vscode from "vscode";

import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";
import { TEXT } from "../../../../webviews/globals/ux-text";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async openExtensionSidebar() {
    const sidebar = await $(`a[aria-label="Firebase Data Connect"]`);
    await sidebar.waitForDisplayed();
    await sidebar.click();
    await this.refresh();

    // single retry to work around Syntax Highlighter download
    try {
      (await browser.$(".monaco-workbench .part.sidebar")).waitForExist({
        timeout: 2000,
      });
    } catch (e) {
      await this.open();
    }
  }

  async waitForSidebar() {
    const sidebar = await browser.$$(".monaco-workbench .part.sidebar");
  }

  async refresh() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand("firebase.refresh");
    });
  }
  async open() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand("fdc_sidebar.focus");
    });
  }

  get hostBtn() {
    return $("vscode-button=Host your Web App");
  }

  /**
   * Starts the emulators and waits for the emulators to be started.
   *
   * This starts emulators by clicking on the button instead of using
   * the command.
   */
  async startEmulators() {
    try {
      await this.runInStudioContext(async (studio) => {
        await studio.startEmulatorsBtn.waitForDisplayed();
        await studio.startEmulatorsBtn.click();
      });
    } catch (e) {
      console.error("Error starting emulators", e);
      await this.startEmulators();
    }
  }

  async currentEmulators() {
    return this.runInStudioContext(async (studio) => {
      const items = await studio.emulatorsList;
      const texts = items.map((item) => item.getText());
      return texts;
    });
  }

  async clearEmulatorData() {
    return this.runInStudioContext(async (studio) => {
      const btn = await studio.clearEmulatorDataBtn;
      return btn.click();
    });
  }

  async exportEmulatorData() {
    return this.runInStudioContext(async (studio) => {
      const btn = await studio.exportEmulatorDataBtn;
      return btn.click();
    });
  }

  async startDeploy() {
    return this.runInStudioContext(async (studio) => {
      await studio.fdcDeployElement.waitForDisplayed();
      await studio.fdcDeployElement.click();
    });
  }

  /** Runs the callback in the context of the Firebase view, within the sidebar */
  async runInStudioContext<R>(
    cb: (firebase: StudioView) => Promise<R>,
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Studio");
    return runInFrame(a, () =>
      runInFrame(b, () => cb(new StudioView(this.workbench))),
    );
  }
}

export class StudioView {
  constructor(readonly workbench: Workbench) {}

  get userIconElement() {
    return $(".codicon-account");
  }

  get signInWithGoogleLink() {
    return $(`vscode-link=${TEXT.GOOGLE_SIGN_IN}`);
  }

  get initFirebaseBtn() {
    return $("vscode-button=Run firebase init");
  }

  get startEmulatorsBtn() {
    return $("vscode-button=Start emulators");
  }

  get clearEmulatorDataBtn() {
    return $("vscode-button=Clear Data Connect data");
  }

  get exportEmulatorDataBtn() {
    return $("vscode-button=Export emulator data");
  }

  get addSdkToAppBtn() {
    return $("vscode-button=Add SDK to app");
  }

  get emulatorsList() {
    return $("ul[class^='list-']").$$(`li span`);
  }

  get fdcDeployElement() {
    return $(`vscode-button=${TEXT.DEPLOY_FDC_ENABLED}`);
  }
}

export class SchemaExplorerView {
  constructor(readonly workbench: Workbench) {}

  get schemaExplorerView() {
    return $('div[aria-label="Schema explorer"] .monaco-list-rows');
  }

  async focusFdcExplorer() {
    await browser.executeWorkbench((vs: typeof vscode) => {
      return vs.commands.executeCommand(
        "firebase.dataConnect.explorerView.focus",
      );
    });
  }

  async waitForData() {
    await this.schemaExplorerView.waitForDisplayed();
  }

  async getQueries() {
    const explorerView = await this.schemaExplorerView;
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
    const explorerView = await this.schemaExplorerView;
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

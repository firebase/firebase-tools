import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";
import { TEXT } from "../../../../webviews/globals/ux-text";
import vscode from "vscode";

export class FirebaseSidebar {
  constructor(readonly workbench: Workbench) {}

  async openExtensionSidebar() {
    await $(`a[aria-label="Firebase Data Connect"]`).click();
  }

  get fdcDeployElement() {
    return $("vscode-button=Deploy");
  }

  /**
   * Starts the emulators and waits for the emulators to be started.
   *
   * This starts emulators by clicking on the button instead of using
   * the command.
   */
  async startEmulators() {
    await this.openExtensionSidebar();
    await this.runInStudioContext(async (studio) => {
      await studio.startEmulatorsBtn.waitForDisplayed();
      await studio.startEmulatorsBtn.click();
    });
  }

  async currentEmulators() {
    return this.runInStudioContext(async (studio) => {
      const items = await studio.emulatorsList;
      const texts = items.map((item) => item.getText());
      return texts;
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

  get startEmulatorsBtn() {
    return $("vscode-button=Start emulators");
  }

  get configureGeneratedSdkBtn() {
    return $("vscode-button=Configure generated SDK");
  }

  get emulatorsList() {
    return $("ul[class^='list-']").$$(`li span`);
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

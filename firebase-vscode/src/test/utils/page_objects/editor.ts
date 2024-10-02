import vscode from "vscode";
import { Workbench } from "wdio-vscode-service";

export class EditorView {
  constructor(readonly workbench: Workbench) {}

  private readonly editorView = this.workbench.getEditorView();

  get firstCodeLense() {
    return this.editorView.elem.$(".codelens-decoration");
  }

  get codeLensesElements() {
    return this.editorView.elem.$$(".codelens-decoration");
  }

  get runLocalButton() {
    return this.editorView.elem.$('//a[contains(text(), "Run (local)")]');
  }

  async openFile(path: string) {
    return browser.executeWorkbench(async (vs: typeof vscode, path) => {
      const doc = await vs.workspace.openTextDocument(path);
      return vs.window.showTextDocument(doc, 1, false);
    }, path);
  }

  async closeAllEditors() {
    return browser.executeWorkbench(async (vs: typeof vscode) => {
      await vs.commands.executeCommand("workbench.action.closeAllEditors");
    });
  }

  async closeCurrentEditor() {
    return browser.executeWorkbench(async (vs: typeof vscode) => {
      await vs.commands.executeCommand("workbench.action.closeActiveEditor");
    });
  }

  async getActiveEditor() {
    return browser.executeWorkbench(async (vs: typeof vscode) => {
      return vs.window.activeTextEditor;
    });
  }

  async activeEditorContent() {
    const editorContentElement = await browser.$(".view-lines");
    return editorContentElement.getText();
  }

  /**
   *
   * @param path The path of the file to diagnose.
   * @returns An array of vscode.Diagnostic objects.
   */
  async diagnoseFile(path: string): Promise<vscode.Diagnostic[]> {
    const diagnostics = await browser.executeWorkbench(
      async (vs: typeof vscode, queriesPath) => {
        const uri = vs.Uri.file(queriesPath);
        let diagnostics = vs.languages.getDiagnostics(uri);

        // Timeout if no diagnostics are found after 10 seconds.
        let timeout = 0;
        while (diagnostics.length === 0 && timeout < 10) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          diagnostics = vs.languages.getDiagnostics(uri);
          timeout++;
        }

        return diagnostics.map((diagnostic) => ({
          message: diagnostic.message,
          range: diagnostic.range,
          severity: diagnostic.severity,
          source: diagnostic.source,
        }));
      },
      path,
    );

    return diagnostics;
  }

  get addDataButton() {
    return $('a[title="Generate a mutation to add data of this type"]');
  }

  get readDataButton() {
    return $('a[title="Generate a query to read data of this type"]');
  }
}

export class Notifications {
  constructor(readonly workbench: Workbench) {}

  /**
   * Wait for the extension recommendation pop-up and click the Install button
   */
  async installRecommendedExtension({
    extensionId,
    message,
  }: {
    extensionId: string;
    message: string;
  }): Promise<void> {
    let foundNotification;
    let tries = 0;

    while (!foundNotification) {
      try {
        const notifications = await browser.$$(
          ".monaco-workbench .notification-list-item",
        );

        // Loop through notifications to find the correct one
        for (let notification of notifications) {
          await notification.waitForDisplayed({ timeout: 1000 });
          const messageText = await notification.getText();
          if (messageText.includes(message)) {
            console.log(`Found notification after ${tries} tries`);
            foundNotification = notification;
            break;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        tries++;

        // Timeout if notification is not found after 3 seconds.
        if (tries > 3) {
          console.warn(
            `Notification with message "${message}" not found after ${tries} tries`,
          );
          return;
        }
      } catch (e) {
        console.warn(e);
        return;
      }
    }

    // Locate and click the "Install" button in the notification
    const installButton = await foundNotification.$("a.monaco-button=Install");
    await installButton.waitForClickable();
    await installButton.click();

    console.log(`Installing extension ${extensionId}`);

    let installed;

    // Wait for the extension to be installed
    while (!installed) {
      installed = await browser.executeWorkbench(
        async (vs: typeof vscode, extensionId) => {
          return vs.extensions.getExtension(extensionId);
        },
        extensionId,
      );
      console.log(`Extension ${extensionId} not installed yet`);
      await browser.pause(1000);
    }

    if (installed) {
      console.log(`Extension ${extensionId} installed`);
    }
  }
}

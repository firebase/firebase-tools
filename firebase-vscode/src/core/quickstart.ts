import vscode, { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { pluginLogger } from "../logger-wrapper";
import { execSync } from "child_process";

export function registerQuickstart(broker: ExtensionBrokerImpl): Disposable {
  const sub = broker.on("chooseQuickstartDir", selectDirectory);

  return { dispose: sub };
}

// Opens a dialog prompting the user to select a directory.
// @returns string file path with directory location
async function selectDirectory() {
  const selectedURI = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });

  /**
   * If the user did not prematurely close the dialog and a directory in
   * which to put the new quickstart was selected, execute a sequence of
   * shell commands that:
   * 1. Downloads the quickstart into the selected directory with `git clone`
   * 2. Enters the downloaded repo and deletes all unnecessary files and dirs
   * 3. Moves all remaining files to the root of the selected directory
   *
   * Once this download and configuration is complete, a new vscode window
   * is opened to the selected directory.
   */
  if (selectedURI && selectedURI[0]) {
    pluginLogger.info("(Quickstart) Downloading Quickstart Project");
    try {
      pluginLogger.info(
        execSync(
          `git clone https://github.com/firebase/quickstart-js.git ` +
            `&& cd quickstart-js && ls | grep -xv "firestore" | xargs rm -rf ` +
            `&& mv -v firestore/* "${selectedURI[0].fsPath}" ` +
            `&& cd "${selectedURI[0].fsPath}" && rm -rf quickstart-js`,
          {
            cwd: selectedURI[0].fsPath,
            encoding: "utf8",
          }
        )
      );
      vscode.commands.executeCommand(`vscode.openFolder`, selectedURI[0]);
    } catch (error) {
      pluginLogger.error(
        "(Quickstart) Error downloading Quickstart:\n" + error
      );
    }
  }
}

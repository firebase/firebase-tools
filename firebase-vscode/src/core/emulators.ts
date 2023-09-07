import vscode, { Disposable } from "vscode";
import {
  emulatorsStart,
  getEmulatorUiUrl,
  listRunningEmulators,
  stopEmulators,
} from "../cli";
import { ExtensionBrokerImpl } from "../extension-broker";

export function registerEmulators(broker: ExtensionBrokerImpl): Disposable {
  broker.on("launchEmulators", async ({ emulatorUiSelections }) => {
    await emulatorsStart(emulatorUiSelections);
    broker.send("notifyRunningEmulatorInfo", {
      uiUrl: getEmulatorUiUrl(),
      displayInfo: listRunningEmulators(),
    });
  });

  broker.on("stopEmulators", async () => {
    await stopEmulators();
    // Update the UI
    broker.send("notifyEmulatorsStopped");
  });

  broker.on("selectEmulatorImportFolder", async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: `Pick an import folder`,
      title: `Pick an import folder`,
      canSelectFiles: false,
      canSelectFolders: true,
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    // Update the UI of the selection
    if (!fileUri || fileUri.length < 1) {
      vscode.window.showErrorMessage("Invalid import folder selected.");
      return;
    }
    broker.send("notifyEmulatorImportFolder", { folder: fileUri[0].fsPath });
  });

  return {
    dispose: async () => {
      await stopEmulators();
    },
  };
}

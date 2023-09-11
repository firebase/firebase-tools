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
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: "Starting emulators",
      },
      async (progress) => {
        progress.report({ increment: 0 });
        try {
          await emulatorsStart(emulatorUiSelections);
          broker.send("notifyRunningEmulatorInfo", {
            uiUrl: getEmulatorUiUrl(),
            displayInfo: listRunningEmulators(),
          });
          vscode.window.showInformationMessage(
            "Firebase Extension: Emulators started successfully"
          );
        } catch (e) {
          broker.send("notifyEmulatorStartFailed");
          vscode.window.showErrorMessage(
            "Firebase Extension: Emulators start failed - " + e
          );
        }
        progress.report({ increment: 100 });
      }
    );
  });

  broker.on("stopEmulators", async () => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: "Stopping emulators",
      },
      async (progress) => {
        progress.report({ increment: 0 });

        await stopEmulators();
        broker.send("notifyEmulatorsStopped");
        vscode.window.showInformationMessage(
          "Firebase Extension: Emulators stopped successfully"
        );

        progress.report({ increment: 100 });
      }
    );
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

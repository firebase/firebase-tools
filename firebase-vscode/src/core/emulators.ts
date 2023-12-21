import vscode, { Disposable } from "vscode";
import {
  emulatorsStart,
  getEmulatorUiUrl,
  listRunningEmulators,
  stopEmulators,
  getEmulatorDetails,
  Emulators,
} from "../cli";
import { ExtensionBrokerImpl } from "../extension-broker";
import { Signal } from "@preact/signals-core";

export const isFirematEmulatorRunning = new Signal<boolean>(false);

export function registerEmulators(broker: ExtensionBrokerImpl): Disposable {
  const outputChannel = vscode.window.createOutputChannel("Firebase Emulators");

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

          // firemat specifics; including temp logging implementation
          if (
            listRunningEmulators().filter((emulatorInfos) => {
              emulatorInfos.name === Emulators.FIREMAT;
            })
          ) {
            const firematEmulatorDetails = getEmulatorDetails(
              Emulators.FIREMAT
            );
            isFirematEmulatorRunning.value = true;

            firematEmulatorDetails.instance.stdout?.on("data", (data) => {
              outputChannel.appendLine("DEBUG: " + data.toString());
            });
            firematEmulatorDetails.instance.stderr?.on("data", (data) => {
              if (data.toString().includes("Finished reload server")) {
                vscode.commands.executeCommand(
                  "firebase.firemat.executeIntrospection"
                );
              } else {
                outputChannel.appendLine("ERROR: " + data.toString());
                outputChannel.show(true); // TODO: decide if necessary to jump to output channel on error
              }
            });
          }
        } catch (e) {
          broker.send("notifyEmulatorStartFailed");
          isFirematEmulatorRunning.value = false; // TODO: verify firemat is not running once other emulators come into play

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
        isFirematEmulatorRunning.value = false;
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

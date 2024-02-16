import * as vscode from "vscode";
import { registerWebview } from "../webview";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect, signal } from "@preact/signals-core";
import { EmulatorsController } from "../core/emulators";
import { QuickPickItem } from "vscode";

export const emulatorInstance = "emulator";
export const selectedInstance = signal<string>(emulatorInstance);

export function registerFirebaseDataConnectView(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
  emulatorsController: EmulatorsController,
): vscode.Disposable {
  const instanceOptions = computed<(QuickPickItem & { id: string })[]>(() => {
    // Some fake options
    const options = <(QuickPickItem & { id: string })[]>[
      {
        label: emulatorsController.areEmulatorsRunning.value
          ? "Emulator"
          : "$(play) Start Emulators",
        id: "emulator",
      },
      { label: "asia-east1", id: "asia-east1" },
      { label: "europe-north1", id: "europe-north1" },
      { label: "wonderland2", id: "wonderland2" },
    ];

    for (const option of options) {
      option.picked = option.id === selectedInstance.value;
    }

    return options;
  });

  const selectedInstanceStatus = vscode.window.createStatusBarItem(
    "instancePicker",
    vscode.StatusBarAlignment.Left,
  );
  selectedInstanceStatus.tooltip = "Select a Firebase instance";
  selectedInstanceStatus.command = "firebase.firemat.connectToInstance";

  function syncStatusBarWithSelectedInstance() {
    return effect(() => {
      selectedInstanceStatus.text = `$(data-connect) ${selectedInstance.value ?? emulatorInstance}`;
      if (!selectedInstance.value) {
        selectedInstanceStatus.backgroundColor = undefined;
      } else {
        selectedInstanceStatus.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      }
      selectedInstanceStatus.show();
    });
  }

  // Handle cases where the instance list changes and the selected instance is no longer in the list.
  function initializeSelectedInstance() {
    return effect(() => {
      const isSelectedInstanceInOptions = instanceOptions.value?.find(
        (e) => e.id === selectedInstance.value,
      );

      if (!isSelectedInstanceInOptions) {
        selectedInstance.value = emulatorInstance;
      }
    });
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      "firebase.firemat.connectToInstance",
      async () => {
        const selected = await vscode.window.showQuickPick(
          instanceOptions.value,
        );
        if (!selected) {
          return;
        }

        selectedInstance.value = selected.id;

        if (
          selected.id === emulatorInstance &&
          !emulatorsController.areEmulatorsRunning.value
        ) {
          emulatorsController.startEmulators();
        }
      },
    ),

    selectedInstanceStatus,
    { dispose: syncStatusBarWithSelectedInstance() },
    { dispose: initializeSelectedInstance() },
    {
      dispose: broker.on("connectToInstance", async () => {
        vscode.commands.executeCommand("firebase.firemat.connectToInstance");
      }),
    },

    registerWebview({ name: "firemat", context, broker }),
  );
}

import * as vscode from "vscode";
import { registerWebview } from "../webview";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect, signal } from "@preact/signals-core";
import { EmulatorsController } from "../core/emulators";
import { QuickPickItem } from "vscode";

export const localInstance = "local";
export const productionInstance = "production";
export const selectedInstance = signal<string>(localInstance);

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
          ? "Local"
          : "$(play) Local",
        id: localInstance,
      },
      { label: "Production", id: productionInstance },
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
  selectedInstanceStatus.command = "firebase.dataConnect.connectToInstance";

  function syncStatusBarWithSelectedInstance() {
    return effect(() => {
      selectedInstanceStatus.text = `$(data-connect) ${selectedInstance.value ?? localInstance}`;
      if (
        !selectedInstance.value ||
        selectedInstance.value === localInstance
      ) {
        selectedInstanceStatus.backgroundColor = undefined;
      } else {
        selectedInstanceStatus.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground",
        );
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
        selectedInstance.value = localInstance;
      }
    });
  }

  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      "firebase.dataConnect.connectToInstance",
      async () => {
        const selected = await vscode.window.showQuickPick(
          instanceOptions.value,
        );
        if (!selected) {
          return;
        }

        selectedInstance.value = selected.id;

        if (
          selected.id === localInstance &&
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
        vscode.commands.executeCommand("firebase.dataConnect.connectToInstance");
      }),
    },

    registerWebview({ name: "data-connect", context, broker }),
  );
}

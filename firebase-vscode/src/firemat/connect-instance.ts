import * as vscode from "vscode";
import { registerWebview } from "../webview";
import { ExtensionBrokerImpl } from "../extension-broker";
import { isFirematEmulatorRunning } from "../core/emulators";
import { computed, effect, signal } from "@preact/signals-core";

export const selectedInstance = signal<string | undefined>(undefined);

export function registerFirebaseDataConnectView(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
): vscode.Disposable {
  const instanceOptions = computed(() => {
    // Some fake options
    const options = ["asia-east1", "europe-north1", "wonderland2"];

    // We start with the emulator option
    const emulator = "emulator";

    // TODO refactor "start emulator" logic to enable the picker to start emulators
    if (isFirematEmulatorRunning.value) {
      options.splice(0, 0, emulator);
    }

    return options;
  });

  const selectedInstanceStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  selectedInstanceStatus.tooltip = "Select a Firebase instance";
  selectedInstanceStatus.command = "firebase.firemat.connectToInstance";

  function syncStatusBarWithSelectedInstance() {
    return effect(() => {
      selectedInstanceStatus.text = selectedInstance.value ?? "<No instance>";
      selectedInstanceStatus.show();
    });
  }

  // Handle cases where the emulator is the currently selected instance,
  // and the emulator is stopped.
  // This also initializes the selectedInstance value to the first instance.
  function initializeSelectedInstance() {
    return effect(() => {
      const isSelectedInstanceInOptions = instanceOptions.value?.includes(
        selectedInstance.value,
      );

      if (!isSelectedInstanceInOptions) {
        selectedInstance.value = instanceOptions.value?.[0];
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

        selectedInstance.value = selected;
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

import * as vscode from "vscode";
import { registerWebview } from "../webview";
import { ExtensionBrokerImpl } from "../extension-broker";
import { isFirematEmulatorRunning } from "../core/emulators";
import { computed, effect, signal } from "@preact/signals-core";

const selectedInstance = signal<string | undefined>(undefined);

export function registerFirebaseDataConnectView(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
): vscode.Disposable {
  const instanceOptions = computed(() => {
    // Some fake options
    const options = ["asia-east1", "europe-north1", "wonderland2"];

    // We start with the emulator option
    const emulator = "Emulator";

    // TODO refactor "start emulator" logic to enable the picker to start emulators
    if (isFirematEmulatorRunning.value) {
      options.splice(0, 0, emulator);
    }

    return options;
  });

  return vscode.Disposable.from(
    {
      // Handle cases where the emulator is the currently selected instance,
      // and the emulator is stopped.
      dispose: effect(() => {
        const isSelectedInstanceInOptions = instanceOptions.value?.includes(
          selectedInstance.value,
        );

        if (!isSelectedInstanceInOptions) {
          selectedInstance.value = undefined;
        }
      }),
    },
    {
      dispose: broker.on("connectToInstance", async () => {
        const selected = await vscode.window.showQuickPick(
          instanceOptions.value,
        );
        if (!selected) {
          return;
        }
      }),
    },

    registerWebview({ name: "firemat", context, broker }),
  );
}

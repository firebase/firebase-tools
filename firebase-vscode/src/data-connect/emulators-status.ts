import * as vscode from "vscode";
import { registerWebview } from "../webview";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect } from "@preact/signals-core";
import { EmulatorsController } from "../core/emulators";
import { Emulators } from "../cli";

export enum InstanceType {
  LOCAL = "local",
  PRODUCTION = "production",
}

export function registerFirebaseDataConnectView(
  context: vscode.ExtensionContext,
  broker: ExtensionBrokerImpl,
  emulatorsController: EmulatorsController
): vscode.Disposable {
  const emulatorsStatus = vscode.window.createStatusBarItem(
    "emulators",
    vscode.StatusBarAlignment.Left
  );
  emulatorsStatus.tooltip = "The emulators status";

  function syncStatusBarWithSelectedInstance() {
    return effect(() => {
      const emulators = emulatorsController.emulatorStates.value;

      const icons: string[] = [];
      // TODO(rrousselGit) add icons for the other Firebase products
      if (emulators?.find((e) => e.name === Emulators.DATACONNECT) ?? false) {
        icons.push("$(data-connect)");
      }

      if (emulators?.find((e) => e.name !== Emulators.DATACONNECT) ?? false) {
        icons.push("$(mono-firebase)");
      }

      if (icons.length === 0) {
        emulatorsStatus.text = `No emulator running`;
        emulatorsStatus.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground"
        );
      } else {
        const label = icons.length === 1 ? "Emulator" : "Emulators";
        emulatorsStatus.backgroundColor = undefined;
        emulatorsStatus.text = `${icons.join(" ")} ${label} running`;
        emulatorsStatus.backgroundColor = undefined;
      }

      emulatorsStatus.show();
    });
  }

  return vscode.Disposable.from(
    emulatorsStatus,
    {
      dispose: syncStatusBarWithSelectedInstance(),
    },
    registerWebview({ name: "data-connect", context, broker })
  );
}

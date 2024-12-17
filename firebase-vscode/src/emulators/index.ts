import * as vscode from "vscode";
import { EmulatorsStatus, RunningEmulatorInfo } from "../messaging/types";
import { Signal, ReadonlySignal } from "@preact/signals-core";
import { RC } from "../rc";
import { Result } from "../result";
import { EmulatorsProvider } from "./emulators-provider";

export type Emulators = {
  status: EmulatorsStatus;
  infos?: RunningEmulatorInfo;
};

export function registerEmulators(
  emulators: Signal<Emulators>,
  rc: ReadonlySignal<Result<RC | undefined>>,
): vscode.Disposable {
  const tree = new EmulatorsProvider();

  return vscode.Disposable.from(
    vscode.window.createStatusBarItem("emulators"),
    vscode.window.createTreeView("firebase.emulators", {
      treeDataProvider: tree,
    }),
  );
}

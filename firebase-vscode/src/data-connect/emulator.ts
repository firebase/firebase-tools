import { EmulatorsController } from "../core/emulators";
import * as vscode from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { Signal, effect, signal } from "@preact/signals-core";
import { RC } from "../rc";
import { firebaseRC, updateFirebaseRCProject } from "../core/config";

/** FDC-specific emulator logic */
export class DataConnectEmulatorController implements vscode.Disposable {
  constructor(
    readonly emulatorsController: EmulatorsController,
    broker: ExtensionBrokerImpl,
  ) {
    function notifyIsConnectedToPostgres(isConnected: boolean) {
      broker.send("notifyIsConnectedToPostgres", isConnected);
    }

    this.subs.push(
      broker.on("connectToPostgres", () => this.connectToPostgres()),
      broker.on("disconnectPostgres", () => this.disconnectPostgres()),

      // Notify webviews when the emulator status changes
      effect(() => {
        notifyIsConnectedToPostgres(this.isPostgresEnabled.value);
      }),

      // Notify the webview of the initial state
      broker.on("getInitialIsConnectedToPostgres", () => {
        notifyIsConnectedToPostgres(this.isPostgresEnabled.value);
      }),
    );
  }

  readonly isPostgresEnabled = signal(false);
  private readonly subs: Array<() => void> = [];

  private async promptConnectionString(
    defaultConnectionString: string,
  ): Promise<string | undefined> {
    const connectionString = await vscode.window.showInputBox({
      title: "Enter a Postgres connection string",
      prompt:
        "A Postgres database must be configured to use the emulator locally.",
      value: defaultConnectionString,
    });

    return connectionString;
  }

  private async connectToPostgres() {
    const rc = firebaseRC.value?.tryReadValue;

    const newConnectionString = await this.promptConnectionString(
      rc?.getDataconnect()?.postgres.localConnectionString ||
        "postgres://user:password@localhost:5432/dbname",
    );
    if (!newConnectionString) {
      return;
    }

    updateFirebaseRCProject({
      fdcPostgresConnectionString: newConnectionString,
    });

    this.isPostgresEnabled.value = true;
    this.emulatorsController.emulatorStatusItem.show();
  }

  private disconnectPostgres() {
    this.isPostgresEnabled.value = false;
    this.emulatorsController.emulatorStatusItem.hide();
  }

  dispose() {
    this.subs.forEach((sub) => sub());
  }
}

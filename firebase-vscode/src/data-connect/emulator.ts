import { EmulatorsController } from "../core/emulators";
import * as vscode from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect, signal } from "@preact/signals-core";
import { firstWhereDefined } from "../utils/signal";
import { firebaseRC, updateFirebaseRCProject } from "../core/config";
import {
  DataConnectEmulatorClient,
  dataConnectEmulatorEvents,
} from "../../../src/emulator/dataconnectEmulator";
import { dataConnectConfigs } from "./config";
import { runEmulatorIssuesStream } from "./emulator-stream";
import { runDataConnectCompiler } from "./core-compiler";
import { pluginLogger } from "../logger-wrapper";

/** FDC-specific emulator logic */
export class DataConnectEmulatorController implements vscode.Disposable {
  constructor(
    readonly emulatorsController: EmulatorsController,
    readonly broker: ExtensionBrokerImpl,
  ) {
    function notifyIsConnectedToPostgres(isConnected: boolean) {
      broker.send("notifyIsConnectedToPostgres", isConnected);
    }

    // on emulator restart, re-connect
    dataConnectEmulatorEvents.on("restart", () => {
      pluginLogger.log("Emulator restarted");
      this.isPostgresEnabled.value = false;
      this.connectToEmulator();
    });

    this.subs.push(
      broker.on("connectToPostgres", () => this.connectToPostgres()),
      // TODO: This is assuming only dataconnect emulator will run
      effect(() => {
        if (this.emulatorsController.emulators.value.status === "running") {
          this.connectToEmulator();
        }
      }),
      // Notify webviews when the emulator status changes
      effect(() => {
        if (this.isPostgresEnabled.value) {
          this.emulatorsController.emulatorStatusItem.show();
        } else {
          this.emulatorsController.emulatorStatusItem.hide();
        }
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
    let localConnectionString =
      rc?.getDataconnect()?.postgres?.localConnectionString;
    if (!localConnectionString) {
      const dataConnectConfigsValue =
        await firstWhereDefined(dataConnectConfigs);
      let dbname = "postgres";
      const postgresql =
        dataConnectConfigsValue?.tryReadValue.values[0]?.value?.schema
          ?.datasource?.postgresql;
      if (postgresql) {
        const instanceId = postgresql.cloudSql?.instanceId;
        const databaseName = postgresql.database;
        if (instanceId && databaseName) {
          dbname = `${instanceId}-${databaseName}`;
        }
      }
      localConnectionString = `postgres://user:password@localhost:5432/${dbname}`;
    }
    const newConnectionString = await this.promptConnectionString(
      localConnectionString,
    );
    if (!newConnectionString) {
      return;
    }

    // notify sidebar webview of connection string
    this.broker.send("notifyPostgresStringChanged", newConnectionString);

    updateFirebaseRCProject({
      fdcPostgresConnectionString: newConnectionString,
    });

    // configure the emulator to use the local psql string
    const emulatorClient = new DataConnectEmulatorClient();
    this.isPostgresEnabled.value = true;

    emulatorClient.configureEmulator({ connectionString: newConnectionString });
  }

  // on schema reload, restart language server and run introspection again
  private async schemaReload() {
    vscode.commands.executeCommand("fdc-graphql.restart");
    vscode.commands.executeCommand("firebase.dataConnect.executeIntrospection");
  }

  // Commands to run after the emulator is started successfully
  private async connectToEmulator() {
    const configs = dataConnectConfigs.value?.tryReadValue;
    runEmulatorIssuesStream(
      configs,
      this.emulatorsController.getLocalEndpoint().value,
      this.isPostgresEnabled,
      this.schemaReload,
    );
    runDataConnectCompiler(
      configs,
      this.emulatorsController.getLocalEndpoint().value,
    );
  }

  dispose() {
    this.subs.forEach((sub) => sub());
  }
}

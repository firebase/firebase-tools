import * as vscode from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect } from "@preact/signals-core";
import { firebaseRC } from "../core/config";
import { dataConnectConfigs, firebaseConfig } from "./config";
import { runDataConnectCompiler } from "./core-compiler";
import { DataConnectToolkitController } from "../../../src/emulator/dataconnectToolkitController";
import { DataConnectEmulatorArgs } from "../emulator/dataconnectEmulator";
import { Config } from "../config";
import { RC } from "../rc";
import { findOpenPort } from "../utils/port_utils";
import { pluginLogger } from "../logger-wrapper";
import { getSettings } from "../utils/settings";

const DEFAULT_PORT = 50001;
/** FDC-specific emulator logic; Toolkit and emulator */
export class DataConnectToolkit implements vscode.Disposable {
  constructor(readonly broker: ExtensionBrokerImpl) {
    this.subs.push(
      effect(() => {
        if (!this.isFDCToolkitRunning()) {
          const rc = firebaseRC.value?.tryReadValue;
          const config = firebaseConfig.value?.tryReadValue;
          if (rc && config) {
            this.startFDCToolkit("./dataconnect", config, rc).then(() => {
              this.connectToToolkit();
            });
          }
        }
      }),
      broker.on("getDocsLink", () => {
        broker.send("notifyDocksLink", this.getGeneratedDocsURL());
      }),
    );
  }

  // special function to start FDC emulator with special flags & port
  async startFDCToolkit(configDir: string, config: Config, RC: RC) {
    const port = await findOpenPort(DEFAULT_PORT);
    const settings = getSettings();

    // Set the conn_evolution preview flag if it's not already set.
    const previewFlags = new Set(["conn_evolution"]);
    if (settings.extraEnv["DATA_CONNECT_PREVIEW"]) {
      settings.extraEnv["DATA_CONNECT_PREVIEW"].split(',').forEach(f => previewFlags.add(f));
    }

    const toolkitArgs: DataConnectEmulatorArgs = {
      projectId: "toolkit",
      listen: [{ address: "localhost", port, family: "IPv4" }],
      config,
      configDir,
      rc: RC,
      autoconnectToPostgres: false,
      enable_output_generated_sdk: true,
      enable_output_schema_extensions: true,
      extraEnv: {...settings.extraEnv, ...{"DATA_CONNECT_PREVIEW": Array.from(previewFlags).join(',')}},
    };
    pluginLogger.info(`Starting Data Connect toolkit (version ${DataConnectToolkitController.getVersion()}) on port ${port}`);
    return DataConnectToolkitController.start(toolkitArgs);
  }

  async stopFDCToolkit() {
    pluginLogger.info(`Stopping Data Connect toolkit`);
    return DataConnectToolkitController.stop();
  }

  isFDCToolkitRunning() {
    return DataConnectToolkitController.isRunning;
  }

  getFDCToolkitURL() {
    return DataConnectToolkitController.getUrl();
  }

  getGeneratedDocsURL() {
    return this.getFDCToolkitURL() + "/docs";
  }

  private readonly subs: Array<() => void> = [];

  // Commands to run after the emulator is started successfully
  private async connectToToolkit() {
    vscode.commands.executeCommand("firebase.dataConnect.executeIntrospection");

    const configs = dataConnectConfigs.value?.tryReadValue!;
    runDataConnectCompiler(configs, this.getFDCToolkitURL());
  }

  dispose() {
    for (const sub of this.subs) {
      sub();
    }
    this.stopFDCToolkit();
  }
}

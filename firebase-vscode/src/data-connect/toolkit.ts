import * as vscode from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect, signal } from "@preact/signals-core";
import { firebaseRC } from "../core/config";
import { dataConnectConfigs, firebaseConfig } from "./config";
import { runEmulatorIssuesStream } from "./emulator-stream";
import { runDataConnectCompiler } from "./core-compiler";
import { DataConnectToolkitController } from "../../../src/emulator/dataconnectToolkitController";
import { DataConnectEmulatorArgs } from "../emulator/dataconnectEmulator";
import * as net from "net";
import { Config } from "../config";
import { RC } from "../rc";

/** FDC-specific emulator logic; Toolkit and emulator */
export class DataConnectToolkit implements vscode.Disposable {
  constructor(
    readonly broker: ExtensionBrokerImpl,
  ) {

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
    );
  }

  // special function to start FDC emulator with special flags & port
  async startFDCToolkit(configDir: string, config: Config, RC: RC) {
    const port = await this.findOpenPort();
    const toolkitArgs: DataConnectEmulatorArgs = {
      projectId: "toolkit",
      listen: [{ address: "localhost", port, family: "IPv4" }],
      config,
      configDir,
      rc: RC,
      enable_output_generated_sdk: true,
      enable_output_schema_extensions: true,
    };
    return DataConnectToolkitController.start(toolkitArgs);
  }

  async stopFDCToolkit() {
    return DataConnectToolkitController.stop();
  }

  isFDCToolkitRunning() {
    return DataConnectToolkitController.isRunning;
  }

  getFDCToolkitURL() {
    //TODO source from ToolkitController
    return "http://localhost:12345";
  }

  readonly isPostgresEnabled = signal(false);
  private readonly subs: Array<() => void> = [];

  // on schema reload, restart language server and run introspection again
  private async schemaReload() {
    vscode.commands.executeCommand("fdc-graphql.restart");
    vscode.commands.executeCommand("firebase.dataConnect.executeIntrospection");
  }

  // Commands to run after the emulator is started successfully
  private async connectToToolkit() {
        vscode.commands.executeCommand(
          "firebase.dataConnect.executeIntrospection",
        );

    const configs = dataConnectConfigs.value?.tryReadValue;
    runEmulatorIssuesStream(
      configs,
      this.getFDCToolkitURL(),
      this.isPostgresEnabled,
      this.schemaReload,
    );
    runDataConnectCompiler(configs, this.getFDCToolkitURL());
  }

  async findOpenPort(startPort = 12345): Promise<number> {
    return new Promise((resolve, reject) => {
      let server: net.Server | null = null;

      server = net.createServer();
      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          // Port is in use, try the next one
          if (server) {
            server.close(() =>
              this.findOpenPort(startPort + 1)
                .then(resolve)
                .catch(reject),
            );
          } else {
            reject(new Error("Server is null while handling EADDRINUSE"));
          }
        } else {
          reject(err);
        }
      });

      server.listen(startPort, () => {
        const address = server?.address();
        if (address && typeof address === "object" && "port" in address) {
          const port = address.port;
          if (server) {
            server.close(() => resolve(port));
          } else {
            reject(new Error("Server is null after successful listen"));
          }
        } else {
          reject(new Error("Invalid address returned from server"));
        }
      });
    });
  }

  dispose() {
    this.subs.forEach((sub) => sub());
    this.stopFDCToolkit();
  }
}

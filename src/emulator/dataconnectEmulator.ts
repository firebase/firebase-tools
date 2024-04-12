import * as childProcess from "child_process";

import { dataConnectLocalConnString } from "../api";
import { Constants } from "./constants";
import { getPID, start, stop, downloadIfNecessary } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { RC } from "../rc";

export interface DataConnectEmulatorArgs {
  projectId?: string;
  port?: number;
  host?: string;
  configDir?: string;
  auto_download?: boolean;
  rc: RC;
}

export class DataConnectEmulator implements EmulatorInstance {
  constructor(private args: DataConnectEmulatorArgs) {}
  private logger = EmulatorLogger.forEmulator(Emulators.DATACONNECT);

  start(): Promise<void> {
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATACONNECT);
    this.logger.log("DEBUG", `Using Postgres connection string: ${this.getLocalConectionString()}`);
    return start(Emulators.DATACONNECT, {
      ...this.args,
      http_port: port,
      grpc_port: port + 1,
      config_dir: this.args.configDir,
      local_connection_string: this.getLocalConectionString(),
    });
  }

  connect(): Promise<void> {
    // TODO: Do some kind of uptime check.
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return stop(Emulators.DATACONNECT);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATACONNECT);

    return {
      name: this.getName(),
      host,
      port,
      pid: getPID(Emulators.DATACONNECT),
    };
  }
  getName(): Emulators {
    return Emulators.DATACONNECT;
  }

  async generate(connectorId: string): Promise<string> {
    const commandInfo = await downloadIfNecessary(Emulators.DATACONNECT);
    const cmd = [
      "generate",
      `--config_dir=${this.args.configDir}`,
      `--connector_id=${connectorId}`,
    ];
    const res = childProcess.spawnSync(commandInfo.binary, cmd, { encoding: "utf-8" });
    if (res.error) {
      throw new FirebaseError(`Error starting up Data Connect emulator: ${res.error}`);
    }
    return res.stdout;
  }

  private getLocalConectionString() {
    if (dataConnectLocalConnString()) {
      return dataConnectLocalConnString();
    }
    return this.args.rc.getDataconnect()?.postgres?.localConnectionString;
  }
}

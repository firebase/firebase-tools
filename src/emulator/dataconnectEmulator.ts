import * as childProcess from "child_process";

import { dataConnectLocalConnString } from "../api";
import { Constants } from "./constants";
import { getPID, start, stop, downloadIfNecessary } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { RC } from "../rc";
import { BuildResult, requiresVector } from "../dataconnect/types";

export interface DataConnectEmulatorArgs {
  projectId?: string;
  port?: number;
  host?: string;
  configDir?: string;
  locationId?: string;
  auto_download?: boolean;
  rc: RC;
}

const grpcDefaultPort = 9510;

export class DataConnectEmulator implements EmulatorInstance {
  constructor(private args: DataConnectEmulatorArgs) {}
  private logger = EmulatorLogger.forEmulator(Emulators.DATACONNECT);

  async start(): Promise<void> {
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATACONNECT);
    this.logger.log("DEBUG", `Using Postgres connection string: ${this.getLocalConectionString()}`);
    const info = await this.build();
    if (requiresVector(info.metadata)) {
      if (Constants.isDemoProject(this.args.projectId)) {
        this.logger.logLabeled(
          "WARN",
          "Data Connect",
          "Detected a 'demo-' project, but vector embeddings require a real project. Operations that use vector_embed will fail.",
        );
      } else {
        this.logger.logLabeled(
          "WARN",
          "Data Connect",
          "Operations that use vector_embed will make calls to production Vertex AI",
        );
      }
    }
    return start(Emulators.DATACONNECT, {
      ...this.args,
      http_port: port,
      grpc_port: grpcDefaultPort,
      config_dir: this.args.configDir,
      local_connection_string: this.getLocalConectionString(),
      project_id: this.args.projectId,
      service_location: this.args.locationId,
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
      timeout: 10_000,
    };
  }
  getName(): Emulators {
    return Emulators.DATACONNECT;
  }

  async generate(connectorId: string): Promise<string> {
    const commandInfo = await downloadIfNecessary(Emulators.DATACONNECT);
    const cmd = [
      "generate",
      `--service_location=${this.args.locationId}`,
      `--config_dir=${this.args.configDir}`,
      `--connector_id=${connectorId}`,
    ];
    const res = childProcess.spawnSync(commandInfo.binary, cmd, { encoding: "utf-8" });
    if (res.error) {
      throw new FirebaseError(`Error starting up Data Connect emulator: ${res.error}`);
    }
    return res.stdout;
  }

  async build(): Promise<BuildResult> {
    const commandInfo = await downloadIfNecessary(Emulators.DATACONNECT);
    const cmd = ["build", `--config_dir=${this.args.configDir}`];

    const res = childProcess.spawnSync(commandInfo.binary, cmd, { encoding: "utf-8" });
    if (res.stderr) {
      throw new FirebaseError(
        `Unable to build your Data Connect schema and connectors: ${res.stderr}`,
      );
    }
    try {
      return JSON.parse(res.stdout) as BuildResult;
    } catch (err) {
      // JSON parse errors are unreadable.
      throw new FirebaseError(`Unable to parse 'fdc build' output: ${res.stdout ?? res.stderr}`);
    }
  }

  private getLocalConectionString() {
    if (dataConnectLocalConnString()) {
      return dataConnectLocalConnString();
    }
    return this.args.rc.getDataconnect()?.postgres?.localConnectionString;
  }
}

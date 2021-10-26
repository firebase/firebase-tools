import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { EmulatorLogger } from "../emulatorLogger";
import express = require("express");

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export class RemoteConfigEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;

  private _logger = EmulatorLogger.forEmulator(Emulators.REMOTE_CONFIG);

  constructor(private args: StorageEmulatorArgs) {}

  get logger(): EmulatorLogger {
    return this._logger;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    this._logger.logLabeled("BULLET", "remote config", `Emulator loading...`);

    this._app = await createApp(this.args.projectId, this);

    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.STORAGE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.STORAGE);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.REMOTE_CONFIG;
  }

  getApp(): express.Express {
    return this._app!;
  }
}

import * as utils from "../../utils";
import { Constants } from "../constants";
import { Emulators, EmulatorInstance, EmulatorInfo } from "../types";
import { createApp } from "./server";

export interface AuthEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
}

export class AuthEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;

  constructor(private args: AuthEmulatorArgs) {}

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    const app = await createApp(this.args.projectId);
    const server = app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.AUTH);
    const port = this.args.port || Constants.getDefaultPort(Emulators.AUTH);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.AUTH;
  }
}

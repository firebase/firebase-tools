import { EmulatorInfo, EmulatorInstance, Emulators } from "../../emulator/types";
import * as express from "express";
import { createDestroyer } from "../../utils";

/**
 * A thing that acts like an emulator by just occupying a port.
 */
export class FakeEmulator implements EmulatorInstance {
  private exp: express.Express;
  private destroyServer?: () => Promise<void>;

  constructor(public name: Emulators, public host: string, public port: number) {
    this.exp = express();
  }

  start(): Promise<void> {
    const server = this.exp.listen(this.port);
    this.destroyServer = createDestroyer(server);
    return Promise.resolve();
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }
  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      host: this.host,
      port: this.port,
    };
  }
  getName(): Emulators {
    return this.name;
  }
}

import { EmulatorInfo, EmulatorInstance, Emulators } from "../../emulator/types";
import * as express from "express";
import * as http from "http";

/**
 * A thing that acts like an emulator by just occupying a port.
 */
export class FakeEmulator implements EmulatorInstance {
  private exp: express.Express;
  private server?: http.Server;

  constructor(public name: Emulators, public host: string, public port: number) {
    this.exp = express();
  }

  start(): Promise<void> {
    this.server = this.exp.listen(this.port);
    return Promise.resolve();
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    return Promise.resolve();
  }
  getInfo(): EmulatorInfo {
    return {
      host: this.host,
      port: this.port,
    };
  }
  getName(): Emulators {
    return this.name;
  }
}

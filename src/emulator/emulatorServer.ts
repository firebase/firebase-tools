import { EmulatorInstance } from "./types";
import { EmulatorRegistry } from "./registry";
import * as portUtils from "./portUtils";
import { FirebaseError } from "../error";

/**
 * Wrapper object to expose an EmulatorInstance for "firebase serve" that
 * also registers the emulator with the registry.
 */
export class EmulatorServer {
  constructor(public instance: EmulatorInstance) {}

  async start(): Promise<void> {
    const { port, host } = this.instance.getInfo();
    const portOpen = await portUtils.checkPortOpen(port, host);

    if (!portOpen) {
      throw new FirebaseError(
        `Port ${port} is not open on ${host}, could not start ${this.instance.getName()} emulator.`
      );
    }

    await EmulatorRegistry.start(this.instance);
  }

  async connect(): Promise<void> {
    await this.instance.connect();
  }

  async stop(): Promise<void> {
    await EmulatorRegistry.stop(this.instance.getName());
  }

  get(): EmulatorInstance {
    return this.instance;
  }
}

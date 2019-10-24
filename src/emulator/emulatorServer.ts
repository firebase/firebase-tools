import { EmulatorInstance } from "./types";
import { EmulatorRegistry } from "./registry";
import * as controller from "./controller";
import { FirebaseError } from "../error";

/**
 * Wrapper object to expose an EmulatorInstance for "firebase serve" that
 * also registers the emulator with the registry.
 */
export class EmulatorServer {
  constructor(public instance: EmulatorInstance) {}

  async start(): Promise<void> {
    const port = this.instance.getInfo().port;
    const portOpen = await controller.checkPortOpen(port);

    if (!portOpen) {
      throw new FirebaseError(
        `Port ${port} is not open, could not start ${this.instance.getName()} emulator.`
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

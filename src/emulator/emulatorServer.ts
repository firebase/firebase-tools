import * as clc from "cli-color";

import { EmulatorInstance } from "./types";
import { EmulatorRegistry } from "./registry";
import * as utils from "../utils";

/**
 * Wrapper object to expose an EmulatorInstance for "firebase serve" that
 * also registers the emulator with the registry.
 */
export class EmulatorServer {
  constructor(public instance: EmulatorInstance) {}

  async start(): Promise<void> {
    await EmulatorRegistry.start(this.instance);

    const name = this.instance.getName();
    const info = this.instance.getInfo();
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

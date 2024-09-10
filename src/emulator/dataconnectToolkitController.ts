import { EmulatorInstance, EmulatorInfo } from "./types";
import { FirebaseError } from "../error";
import * as portUtils from "./portUtils";
import { connectableHostname } from "../utils";
import { DataConnectEmulator, DataConnectEmulatorArgs } from "./dataconnectEmulator";

const name = "Data Connect Toolkit";
/**
 * Static controller for the VSCode Data Connect Toolkit
 */
export class DataConnectToolkitController {
  static instance: EmulatorInstance;
  static isRunning = false;

  static async start(args: DataConnectEmulatorArgs): Promise<void> {
    if (this.isRunning || this.instance) {
      throw new FirebaseError(`${name} is already running!`, {});
    }
    this.instance = new DataConnectEmulator(args);

    // must be before we start as else on a quick 'Ctrl-C' after starting we could skip this emulator in cleanShutdown
    this.isRunning = true;

    // Start the emulator and wait for it to grab its assigned port.
    await this.instance.start();
    const info = this.instance.getInfo();
    await portUtils.waitForPortUsed(info.port, connectableHostname(info.host), info.timeout);
  }

  static async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.instance.stop();
      this.isRunning = false;
    } catch (e: any) {
      // TODO: log error
    }
  }

  /**
   * Get information about an emulator. Use `url` instead for creating URLs.
   */
  static getInfo(): EmulatorInfo | undefined {
    return this.instance.getInfo();
  }
}

import { EmulatorInfo, Emulators } from "./types";
import { FirebaseError } from "../error";
import * as portUtils from "./portUtils";
import { connectableHostname } from "../utils";
import { DataConnectEmulator, DataConnectEmulatorArgs } from "./dataconnectEmulator";
import { getDownloadDetails } from "./downloadableEmulators";

const name = "Data Connect Toolkit";
/**
 * Static controller for the VSCode Data Connect Toolkit
 */
export class DataConnectToolkitController {
  static instance: DataConnectEmulator;
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
      throw new FirebaseError(`Data Connect Toolkit failed to stop with error: ${e}`);
    }
  }

  static getVersion(): string {
    return getDownloadDetails(Emulators.DATACONNECT).version;
  }

  /**
   * Get information about an emulator.
   */
  static getInfo(): EmulatorInfo | undefined {
    return this.instance.getInfo();
  }

  static getUrl(): string {
    const info = this.instance.getInfo();

    // handle ipv6
    if (info.host.includes(":")) {
      return `http://[${info.host}]:${info.port}`;
    }
    return `http://${info.host}:${info.port}`;
  }
}

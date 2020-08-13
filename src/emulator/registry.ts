import { ALL_EMULATORS, EmulatorInstance, Emulators, EmulatorInfo } from "./types";
import { FirebaseError } from "../error";
import * as portUtils from "./portUtils";
import { Constants } from "./constants";
import { EmulatorLogger } from "./emulatorLogger";

/**
 * Static registry for running emulators to discover each other.
 *
 * Note that this is global mutable state, but the state can only be modified
 * through the start() and stop() methods which ensures correctness.
 */
export class EmulatorRegistry {
  static async start(instance: EmulatorInstance): Promise<void> {
    const description = Constants.description(instance.getName());
    if (this.isRunning(instance.getName())) {
      throw new FirebaseError(`${description} is already running!`, {});
    }

    // must be before we start as else on a quick 'Ctrl-C' after starting we could skip this emulator in cleanShutdown
    this.set(instance.getName(), instance);

    // Start the emulator and wait for it to grab its assigned port.
    await instance.start();

    const info = instance.getInfo();
    await portUtils.waitForPortClosed(info.port, info.host);
  }

  static async stop(name: Emulators): Promise<void> {
    EmulatorLogger.forEmulator(name).logLabeled(
      "BULLET",
      name,
      `Stopping ${Constants.description(name)}`
    );
    const instance = this.get(name);
    if (!instance) {
      return;
    }

    await instance.stop();
    this.clear(instance.getName());
  }

  static async stopAll(): Promise<void> {
    await Promise.all(
      this.listRunning().map(async (name) => {
        try {
          await this.stop(name);
        } catch (e) {
          EmulatorLogger.forEmulator(name).logLabeled(
            "WARN",
            name,
            `Error stopping ${Constants.description(name)}`
          );
        }
      })
    );
  }

  static isRunning(emulator: Emulators): boolean {
    const instance = this.INSTANCES.get(emulator);
    return instance !== undefined;
  }

  static listRunning(): Emulators[] {
    return ALL_EMULATORS.filter((name) => this.isRunning(name));
  }

  static listRunningWithInfo(): EmulatorInfo[] {
    return this.listRunning()
      .map((emulator) => this.getInfo(emulator) as EmulatorInfo)
      .filter((info) => typeof info !== "undefined");
  }

  static get(emulator: Emulators): EmulatorInstance | undefined {
    return this.INSTANCES.get(emulator);
  }

  static getInfo(emulator: Emulators): EmulatorInfo | undefined {
    const instance = this.INSTANCES.get(emulator);
    if (!instance) {
      return undefined;
    }

    return instance.getInfo();
  }

  static getPort(emulator: Emulators): number | undefined {
    const instance = this.INSTANCES.get(emulator);
    if (!instance) {
      return undefined;
    }

    return instance.getInfo().port;
  }

  private static INSTANCES: Map<Emulators, EmulatorInstance> = new Map();

  private static set(emulator: Emulators, instance: EmulatorInstance): void {
    this.INSTANCES.set(emulator, instance);
  }

  private static clear(emulator: Emulators): void {
    this.INSTANCES.delete(emulator);
  }
}

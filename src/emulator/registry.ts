import { ALL_EMULATORS, EmulatorInstance, Emulators, EmulatorInfo } from "./types";
import { FirebaseError } from "../error";
import * as portUtils from "./portUtils";
import { Constants } from "./constants";
import { EmulatorLogger } from "./emulatorLogger";
import * as express from "express";

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
    // No need to wait for the Extensions emulator to close its port, since it runs on the Functions emulator.
    if (instance.getName() !== Emulators.EXTENSIONS) {
      const info = instance.getInfo();
      await portUtils.waitForPortClosed(info.port, info.host);
    }
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
    const stopPriority: Record<Emulators, number> = {
      // Turn off the UI first, user should not interact
      // once shutdown starts
      ui: 0,

      // The Extensions emulator runs on the same process as the Functions emulator
      // so this is a no-op. We put this before functions for future proofing, since
      // the Extensions emulator depends on the Functions emulator.
      extensions: 1,
      // Functions is next since it has side effects and
      // dependencies across all the others
      functions: 1.1,

      // Hosting is next because it can trigger functions.
      hosting: 2,

      // All background trigger emulators are equal here, so we choose
      // an order for consistency.
      database: 3.0,
      firestore: 3.1,
      pubsub: 3.2,
      auth: 3.3,
      storage: 3.5,

      // Hub shuts down once almost everything else is done
      hub: 4,

      // Logging is last to catch all errors
      logging: 5,
    };

    const emulatorsToStop = this.listRunning().sort((a, b) => {
      return stopPriority[a] - stopPriority[b];
    });

    for (const name of emulatorsToStop) {
      try {
        await this.stop(name);
      } catch (e: any) {
        EmulatorLogger.forEmulator(name).logLabeled(
          "WARN",
          name,
          `Error stopping ${Constants.description(name)}`
        );
      }
    }
  }

  static isRunning(emulator: Emulators): boolean {
    if (emulator === Emulators.EXTENSIONS) {
      // Check if the functions emulator is also running - if not, the Extensions emulator won't work.
      return this.INSTANCES.get(emulator) !== undefined && this.isRunning(Emulators.FUNCTIONS);
    }
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

  /**
   * Get information about an emulator. Use `url` instead for creating URLs.
   */
  static getInfo(emulator: Emulators): EmulatorInfo | undefined {
    // For Extensions, return the info for the Functions Emulator.
    const instance = this.INSTANCES.get(
      emulator === Emulators.EXTENSIONS ? Emulators.FUNCTIONS : emulator
    );
    if (!instance) {
      return undefined;
    }

    return instance.getInfo();
  }

  /**
   * Get the host:port string for emulator. Use `url` instead for creating URLs.
   */
  static getInfoHostString(info: EmulatorInfo): string {
    const { host, port } = info;

    // Quote IPv6 addresses
    if (host.includes(":")) {
      return `[${host}]:${port}`;
    } else {
      return `${host}:${port}`;
    }
  }

  /**
   * Return a URL object with the emulator protocol, host, and port populated.
   * @param emulator for retrieving host and port from the registry
   * @param req if provided, will prefer reflecting back protocol+host+port from
   *            the express request (if header available) instead of registry
   * @returns a WHATWG URL object with .host set to the emulator host + port
   */
  static url(emulator: Emulators, req?: express.Request): URL {
    // WHATWG URL API has no way to create from parts, so let's use a minimal
    // working URL to start. (Let's avoid legacy Node.js `url.format`.)
    const url = new URL("http://unknown/");

    if (req) {
      url.protocol = req.protocol;
      // Try the Host request header, since it contains hostname + port already
      // and has been proved to work (since we've got the client request).
      const host = req.headers.host;
      if (host) {
        url.host = host;
        return url;
      }
    }

    // Fall back to the host and port from registry. This provides a reasonable
    // value in most cases but may not work if the client needs to connect via
    // another host, e.g. in Dockers or behind reverse proxies.
    const info = EmulatorRegistry.getInfo(emulator);
    if (info) {
      // If listening to all IPv4/6 addresses, use loopback addresses instead.
      // All-zero addresses are invalid and not tolerated by some browsers / OS.
      // See: https://github.com/firebase/firebase-tools-ui/issues/286
      if (info.host === "0.0.0.0") {
        url.hostname = "127.0.0.1";
      } else if (info.host === "::") {
        url.hostname = "[::1]";
      } else if (info.host.includes(":")) {
        url.hostname = `[${info.host}]`; // IPv6 addresses need to be quoted.
      } else {
        url.hostname = info.host;
      }
      url.port = info.port.toString();
    } else {
      // This can probably only happen during testing, but let's warn anyway.
      console.warn(`Cannot determine host and port of ${emulator}`);
    }

    return url;
  }

  private static INSTANCES: Map<Emulators, EmulatorInstance> = new Map();

  private static set(emulator: Emulators, instance: EmulatorInstance): void {
    this.INSTANCES.set(emulator, instance);
  }

  private static clear(emulator: Emulators): void {
    this.INSTANCES.delete(emulator);
  }
}

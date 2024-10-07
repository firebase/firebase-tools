import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { start as apphostingStart } from "./serve";
import { logger } from "./utils";
interface AppHostingEmulatorArgs {
  options?: any;
  port?: number;
  host?: string;
}

/**
 * An emulator instance for Firebase's App Hosting product. This class provides a simulated
 * environment for testing App Hosting features locally.
 */
export class AppHostingEmulator implements EmulatorInstance {
  constructor(private args: AppHostingEmulatorArgs) {}

  async start(): Promise<void> {
    function simpleStringify(object: any) {
      // stringify an object, avoiding circular structures
      // https://stackoverflow.com/a/31557814
      var simpleObject: any = {};
      for (var prop in object) {
        if (!object.hasOwnProperty(prop)) {
          continue;
        }
        if (typeof object[prop] == "object") {
          continue;
        }
        if (typeof object[prop] == "function") {
          continue;
        }
        simpleObject[prop] = object[prop];
      }
      return JSON.stringify(simpleObject); // returns cleaned up JSON
    }
    logger.logLabeled("INFO", Emulators.APPHOSTING, "starting apphosting emulator");
    logger.logLabeled(
      "ERROR",
      Emulators.APPHOSTING,
      `options:  ${simpleStringify(this.args.options)}`,
    );
    const { hostname, port } = await apphostingStart(this.args.options);
    this.args.options.host = hostname;
    this.args.options.port = port;
  }

  connect(): Promise<void> {
    logger.logLabeled("INFO", Emulators.APPHOSTING, "connecting apphosting emulator");
    return Promise.resolve();
  }

  stop(): Promise<void> {
    logger.logLabeled("INFO", Emulators.APPHOSTING, "stopping apphosting emulator");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    return {
      name: Emulators.APPHOSTING,
      host: this.args.options.host!,
      port: this.args.options.port!,
    };
  }

  getName(): Emulators {
    return Emulators.APPHOSTING;
  }
}

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
    logger.logLabeled("INFO", Emulators.APPHOSTING, "starting apphosting emulator");

    const { hostname, port } = await apphostingStart();
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

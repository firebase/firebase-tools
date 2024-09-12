import { EmulatorLogger } from "../emulatorLogger";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { start as apphostingStart } from "./serve";
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
  private logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);
  constructor(private args: AppHostingEmulatorArgs) {}

  async start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    this.logger.logLabeled("INFO", Emulators.APPHOSTING, "starting apphosting emulator");
    const { port } = await apphostingStart(this.args.options);
    this.logger.logLabeled("INFO", Emulators.APPHOSTING, `serving on port ${port}`);
  }

  connect(): Promise<void> {
    this.logger.logLabeled("INFO", Emulators.APPHOSTING, "connecting apphosting emulator");
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.logger.logLabeled("INFO", Emulators.APPHOSTING, "stopping apphosting emulator");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    return {
      name: Emulators.APPHOSTING,
      host: this.args.host!,
      port: this.args.port!,
    };
  }

  getName(): Emulators {
    return Emulators.APPHOSTING;
  }
}

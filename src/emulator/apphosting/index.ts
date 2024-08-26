import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { start as apphostingStart } from "./serve";
interface AppHostingEmulatorArgs {
  options?: any;
  port?: number;
  host?: string;
}

export class AppHostingEmulator implements EmulatorInstance {
  constructor(private args: AppHostingEmulatorArgs) {}

  async start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    console.log("starting apphosting emulator");
    const { port } = await apphostingStart(this.args.options);
    console.log(`serving on port ${port}`);
  }
  connect(): Promise<void> {
    console.log(`connecting apphosting emulator`);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    console.log("stopping apphosting emulator");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    return {
      name: Emulators.APPHOSTING,
      host: "127.0.0.1",
      port: 5001,
    };
  }

  getName(): Emulators {
    return Emulators.APPHOSTING;
  }
}

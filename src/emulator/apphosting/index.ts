import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";

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

    // const { ports } = await serveHosting.start(this.args.options);
    // this.args.port = ports[0];
    // if (ports.length > 1) {
    //   this.reservedPorts = ports.slice(1);
    // }

    console.log(`starting apphosting emulatorr!!`);
  }
  connect(): Promise<void> {
    console.log(`connecting apphosting emulatorr!!`);
    // throw new Error("Method not implemented.");
    return Promise.resolve();
  }

  stop(): Promise<void> {
    // throw new Error("Method not implemented.");
    console.log("stopping apphosting emulator");
    return Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    // throw new Error("Method not implemented.");
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

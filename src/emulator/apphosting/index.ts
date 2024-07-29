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
  }
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  stop(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getInfo(): EmulatorInfo {
    throw new Error("Method not implemented.");
  }

  getName(): Emulators {
    throw new Error("Method not implemented.");
  }
}

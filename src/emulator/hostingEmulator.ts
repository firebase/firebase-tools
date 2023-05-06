import * as serveHosting from "../serve/hosting";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";

interface HostingEmulatorArgs {
  options: any;
  port?: number;
  host?: string;
}

export class HostingEmulator implements EmulatorInstance {
  private reservedPorts?: number[];

  constructor(private args: HostingEmulatorArgs) {}

  async start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    const { ports } = await serveHosting.start(this.args.options);
    this.args.port = ports[0];
    if (ports.length > 1) {
      this.reservedPorts = ports.slice(1);
    }
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return serveHosting.stop();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.HOSTING);

    return {
      name: this.getName(),
      host,
      port,
      reservedPorts: this.reservedPorts,
    };
  }

  getName(): Emulators {
    return Emulators.HOSTING;
  }
}

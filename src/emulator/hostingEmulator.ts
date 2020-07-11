import serveHosting = require("../serve/hosting");
import { EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "./constants";

interface HostingEmulatorArgs {
  options: any;
  port?: number;
  host?: string;
}

export class HostingEmulator implements EmulatorInstance {
  constructor(private args: HostingEmulatorArgs) {}

  start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    return serveHosting.start(this.args.options);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return serveHosting.stop();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.HOSTING);
    const port = this.args.port || Constants.getDefaultPort(Emulators.HOSTING);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.HOSTING;
  }
}

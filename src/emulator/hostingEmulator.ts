import serveHosting = require("../serve/hosting");
import { EmulatorInstance } from "../emulator/types";

interface HostingEmulatorArgs {
  options: any;
  port?: number;
  host?: string;
}

export class HostingEmulator implements EmulatorInstance {
  constructor(private args: HostingEmulatorArgs) {}

  async start(): Promise<void> {
    this.args.options.host = this.args.host;
    this.args.options.port = this.args.port;

    return serveHosting.start(this.args.options);
  }

  async connect(): Promise<void> {
    return;
  }

  stop(): Promise<void> {
    return serveHosting.stop();
  }
}

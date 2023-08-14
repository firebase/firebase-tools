import { Constants } from "./constants";
import { getPID, start, stop } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";

export interface FirematEmulatorArgs {
  projectId?: string;
  port?: number;
  host?: string;
  auto_download?: boolean;
}

export class FirematEmulator implements EmulatorInstance {
  constructor(private args: FirematEmulatorArgs) {}

  start(): Promise<void> {
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIREMAT);
    return start(Emulators.FIREMAT, { ...this.args, http_port: port, grpc_port: port + 1 });
  }

  connect(): Promise<void> {
    // TODO: Do some kind of uptime check.
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return stop(Emulators.FIREMAT);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIREMAT);

    return {
      name: this.getName(),
      host,
      port,
      pid: getPID(Emulators.FIREMAT),
    };
  }
  getName(): Emulators {
    return Emulators.FIREMAT;
  }
}

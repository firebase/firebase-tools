import { Constants } from "./constants";
import { getPID, start, stop } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";

export interface DataConnectEmulatorArgs {
  projectId?: string;
  port?: number;
  host?: string;
  configDir?: string;
  auto_download?: boolean;
}

export class DataConnectEmulator implements EmulatorInstance {
  constructor(private args: DataConnectEmulatorArgs) {}

  start(): Promise<void> {
    // Find dataconnect dir
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATACONNECT);
    return start(Emulators.DATACONNECT, {
      ...this.args,
      http_port: port,
      grpc_port: port + 1,
      config_dir: this.args.configDir,
    });
  }

  connect(): Promise<void> {
    // TODO: Do some kind of uptime check.
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return stop(Emulators.DATACONNECT);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.DATACONNECT);

    return {
      name: this.getName(),
      host,
      port,
      pid: getPID(Emulators.DATACONNECT),
    };
  }
  getName(): Emulators {
    return Emulators.DATACONNECT;
  }
}

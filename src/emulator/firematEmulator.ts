import * as chokidar from "chokidar";
import { Constants } from "./constants";
import { getPID, start, stop } from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";

export interface FirematEmulatorArgs {
  projectId?: string;
  port?: number;
  host?: string;
  configDir?: string;
  auto_download?: boolean;
}

export class FirematEmulator implements EmulatorInstance {
  private gqlWatcher?: chokidar.FSWatcher;
  constructor(private args: FirematEmulatorArgs) {
    if (this.args.configDir) {
      this.gqlWatcher = chokidar.watch(this.args.configDir);
      this.gqlWatcher.on("change", async () => {
        console.log(
          `Detected change in config directory ${this.args.configDir}, restarting fireMAT emulator`
        );
        await this.stop();
        console.log("Stopped fireMAT emulator");
        await this.start();
        console.log("Started fireMAT emulator");
        return;
      });
    }
  }

  start(): Promise<void> {
    // Find firemat dir?
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIREMAT);
    return start(Emulators.FIREMAT, {
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

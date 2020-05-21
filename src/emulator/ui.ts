import { EmulatorInstance, EmulatorInfo, Emulators } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { EmulatorHub } from "./hub";
import { FirebaseError } from "../error";
import { Constants } from "./constants";

export interface EmulatorUIOptions {
  port: number;
  host: string;
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorUI implements EmulatorInstance {
  constructor(private args: EmulatorUIOptions) {}

  start(): Promise<void> {
    if (!EmulatorRegistry.isRunning(Emulators.HUB)) {
      throw new FirebaseError(
        `Cannot start ${Constants.description(Emulators.UI)} without ${Constants.description(
          Emulators.HUB
        )}!`
      );
    }
    const hubInfo = EmulatorRegistry.get(Emulators.HUB)!.getInfo();
    const { auto_download, host, port, projectId } = this.args;
    const env: NodeJS.ProcessEnv = {
      HOST: host.toString(),
      PORT: port.toString(),
      GCLOUD_PROJECT: projectId,
      [EmulatorHub.EMULATOR_HUB_ENV]: `${hubInfo.host}:${hubInfo.port}`,
    };

    return downloadableEmulators.start(Emulators.UI, { auto_download }, env);
  }

  async connect(): Promise<void> {
    return;
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.UI);
  }

  getInfo(): EmulatorInfo {
    return {
      host: this.args.host,
      port: this.args.port,
    };
  }

  getName(): Emulators {
    return Emulators.UI;
  }
}

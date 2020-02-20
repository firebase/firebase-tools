import { EmulatorInstance, EmulatorInfo, Emulators } from "./types";
import * as javaEmulators from "../serve/javaEmulators";
import { EmulatorRegistry } from "./registry";
import { DatabaseEmulator } from "./databaseEmulator";
import { FirestoreEmulator } from "./firestoreEmulator";
import * as url from "url";
import { EmulatorHub } from "./hub";

export interface EmulatorGUIOptions {
  port: number;
  host: string;
  hubInfo: EmulatorInfo;
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorGUI implements EmulatorInstance {
  constructor(private args: EmulatorGUIOptions) {}

  start(): Promise<void> {
    const { hubInfo, auto_download } = this.args;
    const env: NodeJS.ProcessEnv = {
      HOST: this.args.host.toString(),
      PORT: this.args.port.toString(),
      GCLOUD_PROJECT: this.args.projectId,
      [EmulatorHub.EMULATOR_HUB_ENV]: `${hubInfo.host}:${hubInfo.port}`,
    };

    return javaEmulators.start(Emulators.GUI, { auto_download }, env);
  }

  async connect(): Promise<void> {
    return;
  }

  stop(): Promise<void> {
    return javaEmulators.stop(Emulators.GUI);
  }

  getInfo(): EmulatorInfo {
    return {
      host: this.args.host,
      port: this.args.port,
    };
  }

  getName(): Emulators {
    return Emulators.GUI;
  }
}

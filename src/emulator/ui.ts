import { EmulatorInstance, EmulatorInfo, Emulators, ListenSpec } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { Constants } from "./constants";
import { emulatorSession } from "../track";
import { ExpressBasedEmulator } from "./ExpressBasedEmulator";
import { ALL_EXPERIMENTS, ExperimentName, isEnabled } from "../experiments";

export interface EmulatorUIOptions {
  listen: ListenSpec[];
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorUI implements EmulatorInstance {
  constructor(private args: EmulatorUIOptions) {}

  start(): Promise<void> {
    if (!EmulatorRegistry.isRunning(Emulators.HUB)) {
      throw new FirebaseError(
        `Cannot start ${Constants.description(Emulators.UI)} without ${Constants.description(
          Emulators.HUB,
        )}!`,
      );
    }
    const { auto_download: autoDownload, projectId } = this.args;
    const env: Partial<NodeJS.ProcessEnv> = {
      LISTEN: JSON.stringify(ExpressBasedEmulator.listenOptionsFromSpecs(this.args.listen)),
      GCLOUD_PROJECT: projectId,
      [Constants.FIREBASE_EMULATOR_HUB]: EmulatorRegistry.url(Emulators.HUB).host,
    };

    const session = emulatorSession();
    if (session) {
      env[Constants.FIREBASE_GA_SESSION] = JSON.stringify(session);
    }

    const enabledExperiments = (Object.keys(ALL_EXPERIMENTS) as Array<ExperimentName>).filter(
      (experimentName) => isEnabled(experimentName),
    );
    env[Constants.FIREBASE_ENABLED_EXPERIMENTS] = JSON.stringify(enabledExperiments);

    return downloadableEmulators.start(Emulators.UI, { auto_download: autoDownload }, env);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.UI);
  }

  getInfo(): EmulatorInfo {
    return {
      name: this.getName(),
      host: this.args.listen[0].address,
      port: this.args.listen[0].port,
      pid: downloadableEmulators.getPID(Emulators.UI),
    };
  }

  getName(): Emulators {
    return Emulators.UI;
  }
}

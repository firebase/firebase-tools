import { EmulatorInstance, EmulatorInfo, Emulators, ListenSpec } from "./types";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { EmulatorLogger } from "./emulatorLogger";
import { Constants } from "./constants";
import { emulatorSession } from "../track";
import { ExpressBasedEmulator } from "./ExpressBasedEmulator";
import { createApp } from "./ui/server";
import { ALL_EXPERIMENTS, ExperimentName, isEnabled } from "../experiments";
import { createDestroyer } from "../utils";

export interface EmulatorUIOptions {
  listen: ListenSpec[];
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorUI implements EmulatorInstance {

  private destroyServer?: () => Promise<void>;
  constructor(private args: EmulatorUIOptions) { }

  async start(): Promise<void> {
    if (!EmulatorRegistry.isRunning(Emulators.HUB)) {
      throw new FirebaseError(
        `Cannot start ${Constants.description(Emulators.UI)} without ${Constants.description(
          Emulators.HUB,
        )}!`,
      );
    }
    const { projectId } = this.args;

    // FIXME Question: do we need GCLOUD_PROJECT: projectId, for anything?
    const enabledExperiments: Array<ExperimentName> = (Object.keys(ALL_EXPERIMENTS) as Array<ExperimentName>).filter(
      (experimentName) => isEnabled(experimentName),
    );
    const downloadDetails = downloadableEmulators.DownloadDetails[Emulators.UI]; // FIXME Question: use getDownloadDetails to re-use path override? idk
    await downloadableEmulators.downloadIfNecessary(Emulators.UI);

    const server = await createApp(
      downloadDetails.unzipDir!!,
      projectId,
      EmulatorRegistry.url(Emulators.HUB).host,
      emulatorSession(),
      ExpressBasedEmulator.listenOptionsFromSpecs(this.args.listen),
      enabledExperiments);
      this.destroyServer = createDestroyer(server);

  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (this.destroyServer) {
      return this.destroyServer();
    }
    return Promise.resolve();
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

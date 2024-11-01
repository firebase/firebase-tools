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

export interface EmulatorUIOptions {
  listen: ListenSpec[];
  projectId: string;
  auto_download?: boolean;
}

export class EmulatorUI implements EmulatorInstance {
  constructor(private args: EmulatorUIOptions) {}

  async start(): Promise<void> {
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
    env[Constants.FIREBASE_ENABLED_EXPERIMENTS] = JSON.stringify(enabledExperiments); // FIXME pass in GA info

    // return downloadableEmulators.start(Emulators.UI, { auto_download: autoDownload }, env);
    const downloadDetails = downloadableEmulators.DownloadDetails[Emulators.UI];
  const logger = EmulatorLogger.forEmulator(Emulators.UI);
  await downloadableEmulators.downloadIfNecessary(Emulators.UI);

 // FIXME check CI
  // const hasEmulator = fs.existsSync(getExecPath(Emulators.UI));
  // if (!hasEmulator || downloadDetails.opts.skipCache) {
  //   if (args.auto_download) {
  //     if (process.env.CI) {
  //       utils.logWarning(
  //         `It appears you are running in a CI environment. You can avoid downloading the ${Constants.description(
  //           targetName,
  //         )} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`,
  //       );
  //     }

  //     await downloadEmulator(targetName);
  //   } else {
  //     utils.logWarning("Setup required, please run: firebase setup:emulators:" + targetName);
  //     throw new FirebaseError("emulator not found");
  //   }
  // }

  // const command = _getCommand(targetName, args);
  // logger.log(
  //   "DEBUG",
  //   `Starting ${Constants.description(targetName)} with command ${JSON.stringify(command)}`,
  // );
  // return _runBinary(emulator, command, extraEnv);
  // FIXME do some logging probs

  // FIXME consider the host may be different? Should take it from the config methinks
//export function createApp(zipDirPath: string, env : ("DEV" | "PROD"), projectId : string, host : string | undefined, port: string | undefined, hubHost: string ) : Promise<express.Express> {
  await createApp("path", "PROD", projectId, "127.0.0.1", Constants.getDefaultPort(Emulators.UI), EmulatorRegistry.url(Emulators.HUB).host);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    return downloadableEmulators.stop(Emulators.UI); // FIXME consider stop
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

import { capitalize } from "lodash";
import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as features from "./features";
import { RCData } from "../rc";
import { Config } from "../config";
import { FirebaseConfig } from "../firebaseConfig";
import { Options } from "../options";
import { a } from '../../clean/src/accountExporter.spec';

export interface Setup {
  config: FirebaseConfig;
  rcfile: RCData;
  features?: string[];
  featureArg?: boolean;
  featureInfo?: SetupInfo;

  /** Basic Project information */
  project?: Record<string, any>;
  projectId?: string;
  projectLocation?: string;
  isBillingEnabled?: boolean;

  hosting?: Record<string, any>;
}

export interface SetupInfo {
  dataconnect?: features.DataconnectInfo;
}

interface Feature {
  name: string;
  // OLD WAY: A single setup function to ask questions and actuate the setup.
  doSetup?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;

  // NEW WAY: Split the init into two parts:
  // 1. askQuestions: Ask the user questions and update `setup.featureInfo` with the answers.
  askQuestions?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
  // 2. actuate: Use the answers in `setup.featureInfo` to actuate the setup.
  actuate?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
  // 3. [optional]: Additional follow-up steps to run after the setup is completed.
  postSetup?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
}

const featuresList: Feature[] = [
  { name: "account", doSetup: features.account },
  { name: "database", doSetup: features.database },
  { name: "firestore", doSetup: features.firestore },
  // doSetup is split into 2 phases - ask questions and then actuate files and API calls based on those answers.
  {
    name: "dataconnect",
    askQuestions: features.dataconnectAskQuestions,
    actuate: features.dataconnectActuate,
    postSetup: features.dataconnectPostSetup,
  },
  { name: "dataconnect:sdk", doSetup: features.dataconnectSdk },
  { name: "functions", doSetup: features.functions },
  { name: "hosting", doSetup: features.hosting },
  { name: "storage", doSetup: features.storage },
  { name: "emulators", doSetup: features.emulators },
  { name: "extensions", doSetup: features.extensions },
  { name: "project", doSetup: features.project }, // always runs, sets up .firebaserc
  { name: "remoteconfig", doSetup: features.remoteconfig },
  { name: "hosting:github", doSetup: features.hostingGithub },
  { name: "genkit", doSetup: features.genkit },
  { name: "apphosting", doSetup: features.apphosting },
];

const featureMap = new Map(featuresList.map((feature) => [feature.name, feature]));

export async function init(setup: Setup, config: any, options: any): Promise<any> {
  const nextFeature = setup.features?.shift();
  if (nextFeature) {
    const f = featureMap.get(nextFeature);
    if (!f) {
      const availableFeatures = Object.keys(features)
        .filter((f) => f !== "project")
        .join(", ");
      throw new FirebaseError(
        `${clc.bold(nextFeature)} is not a valid feature. Must be one of ${availableFeatures}`,
      );
    }

    logger.info(clc.bold(`\n${clc.white("===")} ${capitalize(nextFeature)} Setup`));

    if (f.doSetup) {
      await f.doSetup(setup, config, options);
    } else {
      if (f.askQuestions) {
      await f.askQuestions(setup, config, options);
      }
      if (f.actuate) {
      await f.actuate(setup, config, options);
      }
    }
    if (f.postSetup) {
      await f.postSetup(setup, config, options);
    }
    return init(setup, config, options);
  }
}

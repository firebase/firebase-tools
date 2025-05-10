import { capitalize } from "lodash";
import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as features from "./features";
import { RCData } from "../rc";
import { Config } from "../config";
import { FirebaseConfig } from "../firebaseConfig";

export interface Setup {
  config: FirebaseConfig;
  rcfile: RCData;
  features?: string[];
  featureArg?: boolean;
  project?: Record<string, any>;
  projectId?: string;
  projectLocation?: string;
  hosting?: Record<string, any>;
}

interface Feature {
  name: string;
  doSetup: (setup: Setup, config: Config, options?: any) => Promise<unknown>;
}

const featuresList: Feature[] = [
  { name: "account", doSetup: features.account },
  { name: "database", doSetup: features.database },
  { name: "firestore", doSetup: features.firestore },
  { name: "dataconnect", doSetup: features.dataconnect },
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

const featureFns = new Map(featuresList.map((feature) => [feature.name, feature.doSetup]));

export async function init(setup: Setup, config: any, options: any): Promise<any> {
  const nextFeature = setup.features?.shift();
  if (nextFeature) {
    if (!featureFns.has(nextFeature)) {
      const availableFeatures = Object.keys(features)
        .filter((f) => f !== "project")
        .join(", ");
      throw new FirebaseError(
        `${clc.bold(nextFeature)} is not a valid feature. Must be one of ${availableFeatures}`,
      );
    }

    logger.info(clc.bold(`\n${clc.white("===")} ${capitalize(nextFeature)} Setup`));

    const fn = featureFns.get(nextFeature);
    if (!fn) {
      // We've already checked that the function exists, so this really should never happen.
      throw new FirebaseError(`We've lost the function to init ${nextFeature}`, { exit: 2 });
    }
    await fn(setup, config, options);
    return init(setup, config, options);
  }
}

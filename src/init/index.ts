import { capitalize } from "lodash";
import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as features from "./features";

export interface Setup {
  config: Record<string, any>;
  rcfile: {
    projects: Record<string, any>;
  };
  features?: string[];
  featureArg?: boolean;
  project?: Record<string, any>;
  projectId?: string;
  projectLocation?: string;
}

const featureFns = new Map<string, (setup: any, config: any, options?: any) => Promise<unknown>>([
  ["account", features.account],
  ["database", features.database],
  ["firestore", features.firestore],
  ["functions", features.functions],
  ["hosting", features.hosting],
  ["storage", features.storage],
  ["emulators", features.emulators],
  ["extensions", features.extensions],
  ["project", features.project], // always runs, sets up .firebaserc
  ["remoteconfig", features.remoteconfig],
  ["hosting:github", features.hostingGithub],
]);

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

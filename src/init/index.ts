import { capitalize } from "lodash";
import * as clc from "colorette";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as features from "./features";
import { RCData } from "../rc";
import { Config } from "../config";
import { FirebaseConfig } from "../firebaseConfig";
import { Options } from "../options";
import { trackGA4 } from "../track";

export interface Setup {
  config: FirebaseConfig;
  rcfile: RCData;
  features?: string[];
  featureArg?: boolean;
  featureInfo?: SetupInfo;

  // Each feature init flow may add instructions.
  // They will be displayed at the end of `firebase init` or
  // return back to `firebase_init` MCP tools.
  instructions: string[];

  /** Basic Project information */
  project?: Record<string, any>;
  projectId?: string;
  projectLocation?: string;
  isBillingEnabled?: boolean;

  hosting?: Record<string, any>;
}

export interface SetupInfo {
  database?: features.DatabaseInfo;
  firestore?: features.FirestoreInfo;
  dataconnect?: features.DataconnectInfo;
  dataconnectSdk?: features.DataconnectSdkInfo;
  storage?: features.StorageInfo;
  apptesting?: features.ApptestingInfo;
  ailogic?: features.AiLogicInfo;
}

interface Feature {
  name: string;
  displayName?: string;
  // OLD WAY: A single setup function to ask questions and actuate the setup.
  doSetup?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;

  // NEW WAY: Split the init into phases:
  // 1. askQuestions: Ask the user questions and update `setup.featureInfo` with the answers.
  askQuestions?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
  // 2. actuate: Use the answers in `setup.featureInfo` to actuate the setup.
  actuate?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
  // 3. [optional] Additional follow-up steps to run after the setup is completed.
  postSetup?: (setup: Setup, config: Config, options: Options) => Promise<unknown>;
}

const featuresList: Feature[] = [
  { name: "account", doSetup: features.account },
  {
    name: "database",
    askQuestions: features.databaseAskQuestions,
    actuate: features.databaseActuate,
  },
  {
    name: "firestore",
    askQuestions: features.firestoreAskQuestions,
    actuate: features.firestoreActuate,
  },
  {
    name: "dataconnect",
    askQuestions: features.dataconnectAskQuestions,
    actuate: features.dataconnectActuate,
  },
  {
    name: "dataconnect:sdk",
    askQuestions: features.dataconnectSdkAskQuestions,
    actuate: features.dataconnectSdkActuate,
  },
  { name: "functions", doSetup: features.functions },
  { name: "hosting", doSetup: features.hosting },
  {
    name: "storage",
    askQuestions: features.storageAskQuestions,
    actuate: features.storageActuate,
  },
  { name: "emulators", doSetup: features.emulators },
  { name: "extensions", doSetup: features.extensions },
  { name: "project", doSetup: features.project }, // always runs, sets up .firebaserc
  { name: "remoteconfig", doSetup: features.remoteconfig },
  { name: "hosting:github", doSetup: features.hostingGithub },
  { name: "genkit", doSetup: features.genkit },
  { name: "apphosting", displayName: "App Hosting", doSetup: features.apphosting },
  {
    name: "apptesting",
    askQuestions: features.apptestingAskQuestions,
    actuate: features.apptestingAcutate,
  },
  {
    name: "ailogic",
    askQuestions: features.aiLogicAskQuestions,
    actuate: features.aiLogicActuate,
  },
  { name: "aitools", displayName: "AI Tools", doSetup: features.aitools },
];

const featureMap = new Map(featuresList.map((feature) => [feature.name, feature]));

/**
 *
 */
export async function init(setup: Setup, config: Config, options: any): Promise<any> {
  const nextFeature = setup.features?.shift();
  if (nextFeature) {
    const start = process.uptime();

    const f = featureMap.get(nextFeature);
    if (!f) {
      const availableFeatures = Object.keys(features)
        .filter((f) => f !== "project")
        .join(", ");
      throw new FirebaseError(
        `${clc.bold(nextFeature)} is not a valid feature. Must be one of ${availableFeatures}`,
      );
    }

    logger.info(
      clc.bold(`\n${clc.white("===")} ${f.displayName || capitalize(nextFeature)} Setup`),
    );

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

    const duration = Math.floor((process.uptime() - start) * 1000);
    await trackGA4("product_init", { feature: nextFeature }, duration);

    return init(setup, config, options);
  }
}

/** Actuate the feature init flow from firebase_init MCP tool. */
export async function actuate(setup: Setup, config: Config, options: any): Promise<any> {
  const nextFeature = setup.features?.shift();
  if (nextFeature) {
    const start = process.uptime();

    const f = lookupFeature(nextFeature);
    logger.info(clc.bold(`\n${clc.white("===")} ${capitalize(nextFeature)} Setup Actuation`));

    if (f.doSetup) {
      throw new FirebaseError(
        `The feature ${nextFeature} does not support actuate yet. Please run ${clc.bold("firebase init " + nextFeature)} instead.`,
      );
    } else {
      if (f.actuate) {
        await f.actuate(setup, config, options);
      }
    }

    const duration = Math.floor((process.uptime() - start) * 1000);
    await trackGA4("product_init_mcp", { feature: nextFeature }, duration);

    return actuate(setup, config, options);
  }
}

function lookupFeature(feature: string): Feature {
  const f = featureMap.get(feature);
  if (!f) {
    const availableFeatures = Object.keys(features)
      .filter((f) => f !== "project")
      .join(", ");
    throw new FirebaseError(
      `${clc.bold(feature)} is not a valid feature. Must be one of ${availableFeatures}`,
    );
  }
  return f;
}

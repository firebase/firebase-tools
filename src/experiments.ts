import { bold } from "colorette";
import * as leven from "leven";

import { configstore } from "./configstore";
import { FirebaseError } from "./error";

export interface Experiment {
  shortDescription: string;
  fullDescription?: string;
  public?: boolean;
  docsUri?: string;
  default?: boolean;
}

// Utility method to ensure there are no typos in defining ALL_EXPERIMENTS
function experiments<Keys extends string>(exp: Record<Keys, Experiment>): Record<Keys, Experiment> {
  return Object.freeze(exp);
}

export const ALL_EXPERIMENTS = experiments({
  // meta:
  experiments: {
    shortDescription: "enables the experiments family of commands",
  },

  // Realtime Database experiments
  rtdbrules: {
    shortDescription: "TODO",
  },
  rtdbmanagement: {
    shortDescription: "TODO",
  },

  // Extensions experiments
  ext: {
    shortDescription: "Enables the 'ext:sources:create' command",
  },
  extdev: {
    shortDescription: "Enalbes the 'ext:dev' family of commands",
  },

  // Cloud Functions for Firebase experiments
  pythonfunctions: {
    shortDescription: "Python support for Cloud Functions for Firebase",
    fullDescription:
      "Adds the ability to initializea and deploy Cloud " +
      "Functions for Firebase in Python. While this feature is experimental " +
      "breaking API changes are allowed in MINOR API revisions",
  },
  golang: {
    shortDescription: "Golang support for Cloud Functions for Firebase. Does not work.",
    fullDescription:
      "Code paths to play with adding support for Golang to Cloud " +
      "Functions for Firebase. This was written to target 1st gen functions, which " +
      "will never be released (all new languages will be 2nd gen only). If you " +
      "are lurking in our experiments folder and are excited about the prospect of " +
      "Golang support, tell our support team.",
  },
  deletegcfartifacts: {
    shortDescription: `Add the ${bold(
      "firebase functions:deletegcfartifacts"
    )} command to purge docker build images`,
    fullDescription:
      `Add the ${bold("firebase functions:deletegcfartifacts")}` +
      "command. Google Cloud Functions creates Docker images when building your " +
      "functions. Cloud Functions for Firebase automatically cleans up these " +
      "images for you on deploy. Customers who predated this cleanup, or customers " +
      "who also deploy Google Cloud Functions with non-Firebase tooling may have " +
      "old Docker images stored in either Google Container Repository or Artifact " +
      `Registry. The ${bold("firebase functions:deletegcfartifacts")} command ` +
      "will delete all Docker images created by Google Cloud Functions irrespective " +
      "of how that image was created.",
    public: true,
  },
  functionsparams: {
    shortDescription: "Adds support for paramaterizing functions deployments",
  },
  skipdeployingnoopfunctions: {
    shortDescription: "Detect that there have been no changes to a function and skip deployment",
  },

  // Emulator experiments
  emulatoruisnapshot: {
    shortDescription: "Load pre-release versions of hte emulator UI",
  },

  // Hosting experiments
  frameworkawareness: {
    shortDescription: "Native support for popular web frameworks",
    fullDescription:
      "Adds support for popular web frameworks such as Next.js " +
      "Nuxt, Netlify, Angular, and Vite-compatible frameworks. Firebase is " +
      "committed to support these platforms long-term, but a manual migration " +
      "may be required when the non-experimental support for these frameworks " +
      "is released",
  },

  // Access experiments
  crossservicerules: {
    shortDescription: "Allow Firebase Rules to reference resources in other services",
  },
});

export type ExperimentName = keyof typeof ALL_EXPERIMENTS;

/** Determines whether a name is a valid experiment name. */
export function isValidExperiment(name: string): name is ExperimentName {
  return Object.keys(ALL_EXPERIMENTS).includes(name);
}

/**
 * Detects experiment names that were potentially what a customer intended to
 * type when they provided malformed.
 * Returns null if the malformed name is actually an experiment. Returns all
 * possible typos.
 */
export function experimentNameAutocorrect(malformed: string): string[] | null {
  if (isValidExperiment(malformed)) {
    return null;
  }

  // N.B. I personally would use < (name.length + malformed.length) * 0.2
  // but this logic matches src/index.ts. I neither want to change something
  // with such potential impact nor to create divergent behavior.
  return Object.keys(ALL_EXPERIMENTS).filter(
    (name) => leven(name, malformed) < malformed.length * 0.4
  );
}
let localPreferencesCache: Record<ExperimentName, boolean> | undefined = undefined;
function localPreferences(): Record<ExperimentName, boolean> {
  if (!localPreferencesCache) {
    localPreferencesCache = configstore.get("previews") as Record<ExperimentName, boolean>;
    for (const key of Object.keys(localPreferencesCache)) {
      if (!isValidExperiment(key)) {
        delete localPreferencesCache[key as ExperimentName];
      }
    }
  }
  return localPreferencesCache;
}

/** Returns whether an experiment is enabled. */
export function isEnabled(name: ExperimentName): boolean {
  return localPreferences()[name] ?? ALL_EXPERIMENTS[name]?.default ?? false;
}

/**
 * Sets whether an experiment is enabled.
 * Set to a boolean value to explicitly opt in or out of an experiment.
 * Set to null to go on the default track for this experiment.
 */
export function setEnabled(name: ExperimentName, to: boolean | null): void {
  if (to === null) {
    delete localPreferences()[name];
  } else {
    localPreferences()[name] = to;
  }
}

/**
 * Assert that an experiment is enabled before following a code path.
 * This code is unnecessary in code paths guarded by ifEnabled. When
 * a customer's project was clearly written against an experiment that
 * was not enabled, assertEnabled will throw a standard error. The "task"
 * param is part of this error. It will be presented as "Cannot ${task}".
 */
export function assertEnabled(name: ExperimentName, task: string): void {
  if (!isEnabled(name)) {
    throw new FirebaseError(
      `Cannot ${task} because the experiment ${bold(name)} is not enabled. To enable ${bold(
        name
      )} run ${bold(`firebase experiments:enable ${name}`)}`
    );
  }
}

/** Saves the current set of enabled experiments to disk. */
export function flushToDisk(): void {
  configstore.set("previews", localPreferences());
}

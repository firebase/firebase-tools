import { bold, italic } from "colorette";
import * as leven from "leven";
import { basename } from "path";

import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import { isRunningInGithubAction } from "./init/features/hosting/github";

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
    shortDescription: "Advanced security rules management",
  },
  rtdbmanagement: {
    shortDescription: "Use new endpoint to administer realtime database instances",
  },
  // Cloud Functions for Firebase experiments
  pythonfunctions: {
    shortDescription: "Python support for Cloud Functions for Firebase",
    fullDescription:
      "Adds the ability to initializea and deploy Cloud " +
      "Functions for Firebase in Python. While this feature is experimental " +
      "breaking API changes are allowed in MINOR API revisions",
  },
  deletegcfartifacts: {
    shortDescription: `Add the ${bold(
      "functions:deletegcfartifacts",
    )} command to purge docker build images`,
    fullDescription:
      `Add the ${bold("functions:deletegcfartifacts")}` +
      "command. Google Cloud Functions creates Docker images when building your " +
      "functions. Cloud Functions for Firebase automatically cleans up these " +
      "images for you on deploy. Customers who predated this cleanup, or customers " +
      "who also deploy Google Cloud Functions with non-Firebase tooling may have " +
      "old Docker images stored in either Google Container Repository or Artifact " +
      `Registry. The ${bold("functions:deletegcfartifacts")} command ` +
      "will delete all Docker images created by Google Cloud Functions irrespective " +
      "of how that image was created.",
    public: true,
  },

  // Emulator experiments
  emulatoruisnapshot: {
    shortDescription: "Load pre-release versions of the emulator UI",
  },

  // Hosting experiments
  webframeworks: {
    shortDescription: "Native support for popular web frameworks",
    fullDescription:
      "Adds support for popular web frameworks such as Next.js " +
      "Angular, React, Svelte, and Vite-compatible frameworks. A manual migration " +
      "may be required when the non-experimental support for these frameworks " +
      "is released",
    docsUri: "https://firebase.google.com/docs/hosting/frameworks-overview",
    public: true,
  },
  pintags: {
    shortDescription: "Adds the pinTag option to Run and Functions rewrites",
    fullDescription:
      "Adds support for the 'pinTag' boolean on Runction and Run rewrites for " +
      "Firebase Hosting. With this option, newly released hosting sites will be " +
      "bound to the current latest version of their referenced functions or services. " +
      "This option depends on Run pinned traffic targets, of which only 2000 can " +
      "exist per region. firebase-tools aggressively garbage collects tags it creates " +
      "if any service exceeds 500 tags, but it is theoretically possible that a project " +
      "exceeds the region-wide limit of tags and an old site version fails",
    public: true,
    default: true,
  },
  // Access experiments
  crossservicerules: {
    shortDescription: "Allow Firebase Rules to reference resources in other services",
  },
  internaltesting: {
    shortDescription: "Exposes Firebase CLI commands intended for internal testing purposes.",
    fullDescription:
      "Exposes Firebase CLI commands intended for internal testing purposes. " +
      "These commands are not meant for public consumption and may break or disappear " +
      "without a notice.",
  },

  internalframeworks: {
    shortDescription: "Allow CLI option for Frameworks",
    default: true,
    public: false,
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
export function experimentNameAutocorrect(malformed: string): string[] {
  if (isValidExperiment(malformed)) {
    throw new FirebaseError(
      "Assertion failed: experimentNameAutocorrect given actual experiment name",
      { exit: 2 },
    );
  }

  // N.B. I personally would use < (name.length + malformed.length) * 0.2
  // but this logic matches src/index.ts. I neither want to change something
  // with such potential impact nor to create divergent behavior.
  return Object.keys(ALL_EXPERIMENTS).filter(
    (name) => leven(name, malformed) < malformed.length * 0.4,
  );
}

let localPreferencesCache: Record<ExperimentName, boolean> | undefined = undefined;
function localPreferences(): Record<ExperimentName, boolean> {
  if (!localPreferencesCache) {
    localPreferencesCache = (configstore.get("previews") || {}) as Record<ExperimentName, boolean>;
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
 * Enables multiple experiments given a comma-delimited environment variable:
 * `FIREBASE_CLI_EXPERIMENTS`.
 *
 * Example:
 * FIREBASE_CLI_PREVIEWS=experiment1,experiment2,turtle
 *
 * Would silently enable `experiment1` and `experiment2`, but would not enable `turtle`.
 */
export function enableExperimentsFromCliEnvVariable(): void {
  const experiments = process.env.FIREBASE_CLI_EXPERIMENTS || "";
  for (const experiment of experiments.split(",")) {
    if (isValidExperiment(experiment)) {
      setEnabled(experiment, true);
    }
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
    const prefix = `Cannot ${task} because the experiment ${bold(name)} is not enabled.`;
    if (isRunningInGithubAction()) {
      const path = process.env.GITHUB_WORKFLOW_REF?.split("@")[0];
      const filename = path ? `.github/workflows/${basename(path)}` : "your action's yml";
      const newValue = [process.env.FIREBASE_CLI_EXPERIMENTS, name].filter((it) => !!it).join(",");
      throw new FirebaseError(
        `${prefix} To enable add a ${bold(
          "FIREBASE_CLI_EXPERIMENTS",
        )} environment variable to ${filename}, like so: ${italic(`

- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    ...
  env:
    FIREBASE_CLI_EXPERIMENTS: ${newValue}
`)}`,
      );
    } else {
      throw new FirebaseError(
        `${prefix} To enable ${bold(name)} run ${bold(`firebase experiments:enable ${name}`)}`,
      );
    }
  }
}

/** Saves the current set of enabled experiments to disk. */
export function flushToDisk(): void {
  configstore.set("previews", localPreferences());
}

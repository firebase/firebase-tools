import { configstore } from "./configstore";
import * as clc from "colorette";
import { FirebaseError } from "./error";

export interface Experiment<Name extends string> {
  name: Name;
  shortDescription: string;
  fullDescription?: string;
  public?: boolean;
  docsUri?: string;
  default?: boolean;
}

function experiment<Name extends string>(
  name: Name,
  shortDescription: string,
  opts?: {
    fullDescription?: string;
    public?: boolean;
    docsUri?: string;
    default?: boolean;
  }
): Experiment<Name> {
  return {
    ...opts,
    name,
    shortDescription,
  } as Experiment<Name>;
}

export const EXPERIMENTS = Object.freeze([
  // meta:
  experiment("experiments", "enables the experiments family of commands"),

  // Realtime Database experiments
  experiment("rtdbrules", "TODO"),
  experiment("rtdbmanagement", "TODO"),

  // Extensions experiments
  experiment("ext", "Enables the 'ext:sources:create' command"),
  experiment("extdev", "Enalbes the 'ext:dev' family of commands"),

  // Cloud Functions for Firebase experiments
  experiment("pythonfunctions", "Python support for Cloud Functions for Firebase", {
    fullDescription:
      "Adds the ability to initializea and deploy Cloud " +
      "Functions for Firebase in Python. While this feature is experimental " +
      "breaking API changes are allowed in MINOR API revisions",
  }),
  experiment("golang", "Golang support for Cloud Functions for Firebase. Does not work.", {
    fullDescription:
      "Code paths to play with adding support for Golang to Cloud " +
      "Functions for Firebase. This was written to target 1st gen functions, which " +
      "will never be released (all new languages will be 2nd gen only). If you " +
      "are lurking in our experiments folder and are excited about the prospect of " +
      "Golang support, tell our support team.",
  }),
  experiment(
    "deletegcfartifacts",
    `Add the ${clc.bold(
      "firebase functions:deletegcfartifacts"
    )} command to purge docker build images`,
    {
      fullDescription:
        `Add the ${clc.bold("firebase functions:deletegcfartifacts")}` +
        "command. Google Cloud Functions creates Docker images when building your " +
        "functions. Cloud Functions for Firebase automatically cleans up these " +
        "images for you on deploy. Customers who predated this cleanup, or customers " +
        "who also deploy Google Cloud Functions with non-Firebase tooling may have " +
        "old Docker images stored in either Google Container Repository or Artifact " +
        `Registry. The ${clc.bold("firebase functions:deletegcfartifacts")} command ` +
        "will delete all Docker images created by Google Cloud Functions irrespective " +
        "of how that image was created.",
      public: true,
    }
  ),
  experiment("functionsparams", "Adds support for paramaterizing functions deployments"),
  experiment(
    "skipdeployingnoopfunctions",
    "Detect that there have been no changes to a function and skip deployment"
  ),

  // Emulator experiments
  experiment("emulatoruisnapshot", "Load pre-release versions of hte emulator UI"),

  // Hosting experiments
  experiment("frameworkawareness", "Native support for popular web frameworks", {
    fullDescription:
      "Adds support for popular web frameworks such as Next.js " +
      "Nuxt, Netlify, Angular, and Vite-compatible frameworks. Firebase is " +
      "committed to support these platforms long-term, but a manual migration " +
      "may be required when the non-experimental support for these frameworks " +
      "is released",
  }),

  // Access experiments
  experiment("crossservicerules", "Allow Firebase Rules to reference resources in other services"),
] as const);

export type ExperimentName = typeof EXPERIMENTS[number]["name"];

export const ALL_EXPERIMENTS: Array<ExperimentName> = EXPERIMENTS.map((e) => e.name);

/** Determines whether a name is a valid experiment name. */
export function isValidExperiment(name: string): name is ExperimentName {
  return ALL_EXPERIMENTS.includes(name as ExperimentName);
}

let localPreferencesCache: Record<ExperimentName, boolean> | undefined = undefined;
function localPreferences(): Record<ExperimentName, boolean> {
  if (!localPreferencesCache) {
    localPreferencesCache = configstore.get("previews") as Record<ExperimentName, boolean>;
    for (const key of Object.keys(localPreferencesCache)) {
      if (!EXPERIMENTS.find((e) => e.name === key)) {
        delete localPreferencesCache[key as ExperimentName];
      }
    }
  }
  return localPreferencesCache;
}

/** Returns whether an experiment is enabled. */
export function isEnabled(name: ExperimentName): boolean {
  const explicit = localPreferences()[name];
  return explicit ?? EXPERIMENTS.find((e) => e.name === name)?.default ?? false;
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
      `Cannot ${task} because the experiment ${clc.bold(name)} is not enabled. To enable ${clc.bold(
        name
      )} run ${clc.bold(`firebase experiments:enable ${name}`)}`
    );
  }
}

/** Gets the list of experiments that are enabled. */
export function getEnabled(): ExperimentName[] {
  const allEnabled = new Set<ExperimentName>();
  for (const [name, isEnabled] of Object.entries(localPreferences())) {
    if (isEnabled) {
      allEnabled.add(name as ExperimentName);
    }
  }
  for (const exp of EXPERIMENTS) {
    if (exp.default) {
      allEnabled.add(exp.name);
    }
  }
  return [...allEnabled];
}

/** Saves the current set of enabled experiments to disk. */
export function flushToDisk(): void {
  configstore.set("previews", localPreferences());
}

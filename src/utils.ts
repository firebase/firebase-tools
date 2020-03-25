import * as _ from "lodash";
import * as clc from "cli-color";
import { Readable } from "stream";

import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import * as logger from "./logger";

const IS_WINDOWS = process.platform === "win32";
const SUCCESS_CHAR = IS_WINDOWS ? "+" : "✔";
const WARNING_CHAR = IS_WINDOWS ? "!" : "⚠";

export const envOverrides: string[] = [];

/**
 * Create a Firebase Console URL for the specified path and project.
 */
export function consoleUrl(project: string, path: string): string {
  const api = require("./api");
  return `${api.consoleOrigin}/project/${project}${path}`;
}

/**
 * Trace up the ancestry of objects that have a `parent` key, finding the
 * first instance of the provided key.
 */
export function getInheritedOption(options: any, key: string): any {
  let target = options;
  while (target) {
    if (_.has(target, key)) {
      return target[key];
    }
    target = target.parent;
  }
}

/**
 * Override a value with supplied environment variable if present. A function
 * that returns the environment variable in an acceptable format can be
 * proivded. If it throws an error, the default value will be used.
 */
export function envOverride(
  envname: string,
  value: string,
  coerce?: (value: string, defaultValue: string) => any
): string {
  const currentEnvValue = process.env[envname];
  if (currentEnvValue && currentEnvValue.length) {
    envOverrides.push(envname);
    if (coerce) {
      try {
        return coerce(currentEnvValue, value);
      } catch (e) {
        return value;
      }
    }
    return currentEnvValue;
  }
  return value;
}

/**
 * Add a subdomain to the specified HTTP origin.
 * (e.g. https://example.com -> https://sub.example.com)
 */
export function addSubdomain(origin: string, subdomain: string): string {
  return origin.replace("//", `//${subdomain}.`);
}

/**
 * Log an info statement with a green checkmark at the start of the line.
 */
export function logSuccess(message: string, type = "info"): void {
  logger[type](clc.green.bold(`${SUCCESS_CHAR} `), message);
}

/**
 * Log an info statement with a green checkmark at the start of the line.
 */
export function logLabeledSuccess(label: string, message: string, type = "info"): void {
  logger[type](clc.green.bold(`${SUCCESS_CHAR}  ${label}:`), message);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logBullet(message: string, type = "info"): void {
  logger[type](clc.cyan.bold("i "), message);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledBullet(label: string, message: string, type = "info"): void {
  logger[type](clc.cyan.bold(`i  ${label}:`), message);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logWarning(message: string, type = "warn"): void {
  logger[type](clc.yellow.bold(`${WARNING_CHAR} `), message);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledWarning(label: string, message: string, type = "warn"): void {
  logger[type](clc.yellow.bold(`${WARNING_CHAR}  ${label}:`), message);
}

/**
 * Return a promise that rejects with a FirebaseError.
 */
export function reject(message: string, options?: any): Promise<void> {
  return Promise.reject(new FirebaseError(message, options));
}

/**
 * Print out an explanatory message if a TTY is detected for how to manage STDIN
 */
export function explainStdin(): void {
  if (IS_WINDOWS) {
    throw new FirebaseError("STDIN input is not available on Windows.", {
      exit: 1,
    });
  }
  if (process.stdin.isTTY) {
    logger.info(clc.bold("Note:"), "Reading STDIN. Type JSON data and then press Ctrl-D");
  }
}

/**
 * Convert text input to a Readable stream.
 */
export function stringToStream(text: string): Readable | undefined {
  if (!text) {
    return undefined;
  }
  const s = new Readable();
  s.push(text);
  s.push(null);
  return s;
}

/**
 * Sets the active project alias or id in the specified directory.
 */
export function makeActiveProject(projectDir: string, newActive: string): void {
  const activeProjects = configstore.get("activeProjects") || {};
  if (newActive) {
    activeProjects[projectDir] = newActive;
  } else {
    _.unset(activeProjects, projectDir);
  }
  configstore.set("activeProjects", activeProjects);
}

/**
 * Creates API endpoint string, e.g. /v1/projects/pid/cloudfunctions
 */
export function endpoint(parts: string[]): string {
  return `/${_.join(parts, "/")}`;
}

/**
 * Gets the event provider name for a Cloud Function from the trigger's
 * eventType string.
 */
export function getFunctionsEventProvider(eventType: string): string {
  // Legacy event types:
  const parts = eventType.split("/");
  if (parts.length > 1) {
    const provider = _.last(parts[1].split("."));
    return _.capitalize(provider);
  }
  // New event types:
  if (eventType.match(/google.pubsub/)) {
    return "PubSub";
  } else if (eventType.match(/google.storage/)) {
    return "Storage";
  } else if (eventType.match(/google.analytics/)) {
    return "Analytics";
  } else if (eventType.match(/google.firebase.database/)) {
    return "Database";
  } else if (eventType.match(/google.firebase.auth/)) {
    return "Auth";
  } else if (eventType.match(/google.firebase.crashlytics/)) {
    return "Crashlytics";
  } else if (eventType.match(/google.firestore/)) {
    return "Firestore";
  }
  return _.capitalize(eventType.split(".")[1]);
}

export interface SettledPromiseResolved {
  state: "fulfilled";
  value: any;
}

export interface SettledPromiseRejected {
  state: "rejected";
  reason: Error;
}

export type SettledPromise = SettledPromiseResolved | SettledPromiseRejected;

/**
 * Returns a single Promise that is resolved when all the given promises have
 * either resolved or rejected.
 */
export function promiseAllSettled(promises: Array<Promise<any>>): Promise<SettledPromise[]> {
  const wrappedPromises = _.map(promises, async (p) => {
    try {
      const val = await Promise.resolve(p);
      return { state: "fulfilled", value: val } as SettledPromiseResolved;
    } catch (err) {
      return { state: "rejected", reason: err } as SettledPromiseRejected;
    }
  });
  return Promise.all(wrappedPromises);
}

/**
 * Runs a given function (that returns a Promise) repeatedly while the given
 * sync check returns false. Resolves with the value that passed the check.
 */
export async function promiseWhile<T>(
  action: () => Promise<T>,
  check: (value: T) => boolean,
  interval = 2500
): Promise<T> {
  return new Promise<T>((resolve, promiseReject) => {
    const run = async () => {
      try {
        const res = await action();
        if (check(res)) {
          return resolve(res);
        }
        setTimeout(run, interval);
      } catch (err) {
        return promiseReject(err);
      }
    };
    run();
  });
}

/**
 * Resolves all Promises at every key in the given object. If a value is not a
 * Promise, it is returned as-is.
 */
export async function promiseProps(obj: any): Promise<any> {
  const resultObj: any = {};
  const promises = _.keys(obj).map(async (key) => {
    const r = await Promise.resolve(obj[key]);
    resultObj[key] = r;
  });
  return Promise.all(promises).then(() => resultObj);
}

import * as _ from "lodash";
import * as url from "url";
import * as http from "http";
import * as clc from "cli-color";
import * as ora from "ora";
import * as process from "process";
import { Readable } from "stream";
import * as winston from "winston";
import { SPLAT } from "triple-beam";
const ansiStrip = require("cli-color/strip") as (input: string) => string;

import { configstore } from "./configstore";
import { FirebaseError } from "./error";
import * as logger from "./logger";
import { LogDataOrUndefined } from "./emulator/loggingEmulator";
import { Socket } from "net";

const IS_WINDOWS = process.platform === "win32";
const SUCCESS_CHAR = IS_WINDOWS ? "+" : "✔";
const WARNING_CHAR = IS_WINDOWS ? "!" : "⚠";
const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

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
 * Get the full URL to a path in the database or database emulator.
 */
export function getDatabaseUrl(origin: string, namespace: string, pathname: string): string {
  const withPath = url.resolve(origin, pathname);
  return addDatabaseNamespace(withPath, namespace);
}

/**
 * Get the URL to view data in the database or database emulator.
 *  - Prod: Firebase Console URL
 *  - Emulator: Localhost URL to a `.json` endpoint.
 */
export function getDatabaseViewDataUrl(
  origin: string,
  project: string,
  namespace: string,
  pathname: string
): string {
  const urlObj = new url.URL(origin);
  if (
    urlObj.hostname.includes("firebaseio.com") ||
    urlObj.hostname.includes("firebasedatabase.app")
  ) {
    return consoleUrl(project, `/database/${namespace}/data${pathname}`);
  } else {
    // TODO(samstern): View in Emulator UI
    return getDatabaseUrl(origin, namespace, pathname + ".json");
  }
}

/**
 * Add the namespace to a database or database emulator URL.
 *  - Prod: Add a subdomain.
 *  - Emulator: Add `?ns=` parameter.
 */
export function addDatabaseNamespace(origin: string, namespace: string): string {
  const urlObj = new url.URL(origin);
  if (urlObj.hostname.includes(namespace)) {
    return urlObj.href;
  }
  if (
    urlObj.hostname.includes("firebaseio.com") ||
    urlObj.hostname.includes("firebasedatabase.app")
  ) {
    return addSubdomain(origin, namespace);
  } else {
    urlObj.searchParams.set("ns", namespace);
    return urlObj.href;
  }
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
export function logSuccess(
  message: string,
  type = "info",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.green.bold(`${SUCCESS_CHAR} `), message, data);
}

/**
 * Log an info statement with a green checkmark at the start of the line.
 */
export function logLabeledSuccess(
  label: string,
  message: string,
  type = "info",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.green.bold(`${SUCCESS_CHAR}  ${label}:`), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logBullet(
  message: string,
  type = "info",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.cyan.bold("i "), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledBullet(
  label: string,
  message: string,
  type = "info",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.cyan.bold(`i  ${label}:`), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logWarning(
  message: string,
  type = "warn",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.yellow.bold(`${WARNING_CHAR} `), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledWarning(
  label: string,
  message: string,
  type = "warn",
  data: LogDataOrUndefined = undefined
): void {
  logger[type](clc.yellow.bold(`${WARNING_CHAR}  ${label}:`), message, data);
}

/**
 * Return a promise that rejects with a FirebaseError.
 */
export function reject(message: string, options?: any): Promise<never> {
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
 * Converts text input to a Readable stream.
 * @param text string to turn into a stream.
 * @return Readable stream, or undefined if text is empty.
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
 * Converts a Readable stream into a string.
 * @param s a readable stream.
 * @return a promise resolving to the string'd contents of the stream.
 */
export function streamToString(s: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = "";
    s.on("error", reject);
    s.on("data", (d) => (b += `${d}`));
    s.once("end", () => resolve(b));
  });
}

/**
 * Sets the active project alias or id in the specified directory.
 */
export function makeActiveProject(projectDir: string, newActive: string | null): void {
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

/**
 * Attempts to call JSON.stringify on an object, if it throws return the original value
 * @param value
 */
export function tryStringify(value: any) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return value;
  }
}

/**
 * Attempts to call JSON.parse on an object, if it throws return the original value
 * @param value
 */
export function tryParse(value: any) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function setupLoggers() {
  if (process.env.DEBUG) {
    logger.add(
      new winston.transports.Console({
        level: "debug",
        format: winston.format.printf((info) => {
          const segments = [info.message, ...(info[SPLAT] || [])].map(tryStringify);
          return `${ansiStrip(segments.join(" "))}`;
        }),
      })
    );
  } else if (process.env.IS_FIREBASE_CLI) {
    logger.add(
      new winston.transports.Console({
        level: "info",
        format: winston.format.printf((info) =>
          [info.message, ...(info[SPLAT] || [])]
            .filter((chunk) => typeof chunk == "string")
            .join(" ")
        ),
      })
    );
  }
}

/**
 * Runs a given function inside a spinner with a message
 */
export async function promiseWithSpinner<T>(action: () => Promise<T>, message: string): Promise<T> {
  const spinner = ora(message).start();
  let data;
  try {
    data = await action();
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  return data;
}

/**
 * Return a "destroy" function for a Node.js HTTP server. MUST be called on
 * server creation (e.g. right after `.listen`), BEFORE any connections.
 *
 * Inspired by https://github.com/isaacs/server-destroy/blob/master/index.js
 *
 * @returns a function that destroys all connections and closes the server
 */
export function createDestroyer(server: http.Server): () => Promise<void> {
  const connections = new Set<Socket>();

  server.on("connection", (conn) => {
    connections.add(conn);
    conn.once("close", () => connections.delete(conn));
  });

  // Make calling destroyer again just noop but return the same promise.
  let destroyPromise: Promise<void> | undefined = undefined;
  return function destroyer() {
    if (!destroyPromise) {
      destroyPromise = new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
        connections.forEach((socket) => socket.destroy());
      });
    }
    return destroyPromise;
  };
}

/**
 * Returns the given date formatted as `YYYY-mm-dd HH:mm:ss`.
 * @param d the date to format.
 * @return the formatted date.
 */
export function datetimeString(d: Date): string {
  const day = `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  const time = `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  return `${day} ${time}`;
}

/**
 * Indicates whether the end-user is running the CLI from a cloud-based environment.
 */
export function isCloudEnvironment() {
  return !!process.env.CODESPACES;
}

/**
 * Indicates whether or not this process is likely to be running in WSL.
 * @return true if we're likely in WSL, false otherwise
 */
export function isRunningInWSL(): boolean {
  return !!process.env.WSL_DISTRO_NAME;
}

/**
 * Generates a date that is 30 days from Date.now()
 */
export function thirtyDaysFromNow(): Date {
  return new Date(Date.now() + THIRTY_DAYS_IN_MILLISECONDS);
}

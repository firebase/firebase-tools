import * as fs from "fs-extra";
import * as tty from "tty";
import * as path from "node:path";
import * as yaml from "yaml";
import { Socket } from "node:net";
import * as crypto from "node:crypto";

import * as _ from "lodash";
import * as url from "url";
import * as http from "http";
import * as clc from "colorette";
import * as open from "open";
import * as ora from "ora";
import * as process from "process";
import { Readable } from "stream";
import { AssertionError } from "assert";
import { getPortPromise as getPort } from "portfinder";

import { configstore } from "./configstore";
import { FirebaseError, getErrMsg, getError } from "./error";
import { logger, LogLevel } from "./logger";
import { LogDataOrUndefined } from "./emulator/loggingEmulator";
import { input, password } from "./prompt";
import { readTemplateSync } from "./templates";
import { isVSCodeExtension } from "./vsCodeUtils";
import { Config } from "./config";
import { dirExistsSync, fileExistsSync } from "./fsutils";
import { platform } from "node:os";
import { execSync } from "node:child_process";
export const IS_WINDOWS = process.platform === "win32";
const SUCCESS_CHAR = IS_WINDOWS ? "+" : "✔";
const WARNING_CHAR = IS_WINDOWS ? "!" : "⚠";
const ERROR_CHAR = IS_WINDOWS ? "!!" : "⬢";
const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export const envOverrides: string[] = [];
export const vscodeEnvVars: { [key: string]: string } = {};
/**
 * Create a Firebase Console URL for the specified path and project.
 */
export function consoleUrl(project: string, path: string): string {
  const api = require("./api");
  return `${api.consoleOrigin()}/project/${project}${path}`;
}

/**
 * Trace up the ancestry of objects that have a `parent` key, finding the
 * first instance of the provided key.
 */
export function getInheritedOption(options: any, key: string): any {
  let target = options;
  while (target) {
    if (target[key] !== undefined) {
      return target[key];
    }
    target = target.parent;
  }
}

/**
 * Sets the VSCode environment variables to be used by the CLI when called by VSCode
 * @param envVar name of the environment variable
 * @param value value of the environment variable
 */
export function setVSCodeEnvVars(envVar: string, value: string) {
  vscodeEnvVars[envVar] = value;
}

/**
 * Override a value with supplied environment variable if present. A function
 * that returns the environment variable in an acceptable format can be
 * proivded. If it throws an error, the default value will be used.
 */
export function envOverride(
  envname: string,
  value: string,
  coerce?: (value: string, defaultValue: string) => any,
): string {
  const currentEnvValue =
    isVSCodeExtension() && vscodeEnvVars[envname] ? vscodeEnvVars[envname] : process.env[envname];
  if (currentEnvValue && currentEnvValue.length) {
    envOverrides.push(envname);
    if (coerce) {
      try {
        return coerce(currentEnvValue, value);
      } catch (e: any) {
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
  pathname: string,
): string {
  const urlObj = new url.URL(origin);
  if (urlObj.hostname.includes("firebaseio") || urlObj.hostname.includes("firebasedatabase")) {
    return consoleUrl(project, `/database/${namespace}/data${pathname}`);
  }
  // TODO(samstern): View in Emulator UI
  return getDatabaseUrl(origin, namespace, pathname + ".json");
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
  if (urlObj.hostname.includes("firebaseio") || urlObj.hostname.includes("firebasedatabase")) {
    return addSubdomain(origin, namespace);
  }
  urlObj.searchParams.set("ns", namespace);
  return urlObj.href;
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
  type: LogLevel = "info",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.green(clc.bold(`${SUCCESS_CHAR} `)), message, data);
}

/**
 * Log an info statement with a green checkmark at the start of the line.
 */
export function logLabeledSuccess(
  label: string,
  message: string,
  type: LogLevel = "info",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.green(clc.bold(`${SUCCESS_CHAR}  ${label}:`)), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logBullet(
  message: string,
  type: LogLevel = "info",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.cyan(clc.bold("i ")), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledBullet(
  label: string,
  message: string,
  type: LogLevel = "info",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.cyan(clc.bold(`i  ${label}:`)), message, data);
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logWarning(
  message: string,
  type: LogLevel = "warn",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.yellow(clc.bold(`${WARNING_CHAR} `)), message, data);
}

/**
 * Log a warning statement to stderr, regardless of logger configuration.
 */
export function logWarningToStderr(message: string): void {
  const prefix = clc.bold(`${WARNING_CHAR} `);
  process.stderr.write(clc.yellow(prefix + message) + "\n");
}

/**
 * Log an info statement with a gray bullet at the start of the line.
 */
export function logLabeledWarning(
  label: string,
  message: string,
  type: LogLevel = "warn",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.yellow(clc.bold(`${WARNING_CHAR}  ${label}:`)), message, data);
}

/**
 * Log an error statement with a red bullet at the start of the line.
 */
export function logLabeledError(
  label: string,
  message: string,
  type: LogLevel = "error",
  data: LogDataOrUndefined = undefined,
): void {
  logger[type](clc.red(clc.bold(`${ERROR_CHAR}  ${label}:`)), message, data);
}

/**
 * Return a promise that rejects with a FirebaseError.
 */
export function reject(message: string, options?: any): Promise<never> {
  return Promise.reject(new FirebaseError(message, options));
}

/** An interface for the result of a successful Promise */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PromiseFulfilledResult<T = any> {
  status: "fulfilled";
  value: T;
}

export interface PromiseRejectedResult {
  status: "rejected";
  reason: unknown;
}

export type PromiseResult<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;

/**
 * Polyfill for Promise.allSettled
 * TODO: delete once min Node version is 12.9.0 or greater
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function allSettled<T>(promises: Array<Promise<T>>): Promise<Array<PromiseResult<T>>> {
  if (!promises.length) {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    let remaining = promises.length;
    const results: Array<PromiseResult<T>> = [];
    for (let i = 0; i < promises.length; i++) {
      // N.B. We use the void operator to silence the linter that we have
      // a dangling promise (we are, after all, handling all failures).
      // We resolve the original promise so as not to crash when passed
      // a non-promise. This is part of the spec.
      void Promise.resolve(promises[i])
        .then(
          (result) => {
            results[i] = {
              status: "fulfilled",
              value: result,
            };
          },
          (err) => {
            results[i] = {
              status: "rejected",
              reason: err,
            };
          },
        )
        .then(() => {
          if (!--remaining) {
            resolve(results);
          }
        });
    }
  });
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
export function makeActiveProject(projectDir: string, newActive?: string): void {
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
  return `/${parts.join("/")}`;
}

/**
 * Gets the event provider name for a Cloud Function from the trigger's
 * eventType string.
 */
export function getFunctionsEventProvider(eventType: string): string {
  // Legacy event types:
  const parts = eventType.split("/");
  if (parts.length > 1) {
    const provider = last(parts[1].split("."));
    return _.capitalize(provider);
  }
  // 1st gen event types:
  if (/google.*pubsub/.exec(eventType)) {
    return "PubSub";
  } else if (/google.storage/.exec(eventType)) {
    return "Storage";
  } else if (/google.analytics/.exec(eventType)) {
    return "Analytics";
  } else if (/google.firebase.database/.exec(eventType)) {
    return "Database";
  } else if (/google.firebase.auth/.exec(eventType)) {
    return "Auth";
  } else if (/google.firebase.crashlytics/.exec(eventType)) {
    return "Crashlytics";
  } else if (/google.*firestore/.exec(eventType)) {
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
  const wrappedPromises = promises.map(async (p) => {
    try {
      const val = await Promise.resolve(p);
      return { state: "fulfilled", value: val } as SettledPromiseResolved;
    } catch (err: any) {
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
  interval = 2500,
): Promise<T> {
  return new Promise<T>((resolve, promiseReject) => {
    const run = async () => {
      try {
        const res = await action();
        if (check(res)) {
          return resolve(res);
        }
        setTimeout(run, interval);
      } catch (err: unknown) {
        return promiseReject(err);
      }
    };
    run();
  });
}

/**
 * Return a promise that rejects after timeoutMs but otherwise behave the same.
 * @param timeoutMs the time in milliseconds before forced rejection
 * @param promise the original promise
 * @return a promise wrapping the original promise with rejection on timeout
 */
export function withTimeout<T>(timeoutMs: number, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out.")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    );
  });
}

/**
 * Resolves all Promises at every key in the given object. If a value is not a
 * Promise, it is returned as-is.
 */
export async function promiseProps(obj: any): Promise<any> {
  const resultObj: any = {};
  const promises = Object.keys(obj).map(async (key) => {
    const r = await Promise.resolve(obj[key]);
    resultObj[key] = r;
  });
  return Promise.all(promises).then(() => resultObj);
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

/**
 * Runs a given function inside a spinner with a message
 */
export async function promiseWithSpinner<T>(action: () => Promise<T>, message: string): Promise<T> {
  const spinner = ora(message).start();
  let data;
  try {
    data = await action();
    spinner.succeed();
  } catch (err: unknown) {
    spinner.fail();
    throw err;
  }

  return data;
}

/** Creates a promise that resolves after a given timeout. await to "sleep". */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Return a "destroy" function for a Node.js HTTP server. MUST be called on
 * server creation (e.g. right after `.listen`), BEFORE any connections.
 *
 * Inspired by https://github.com/isaacs/server-destroy/blob/master/index.js
 * @return a function that destroys all connections and closes the server
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
  const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`;
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
  return (
    !!process.env.CODESPACES ||
    !!process.env.GOOGLE_CLOUD_WORKSTATIONS ||
    !!process.env.CLOUD_SHELL ||
    !!process.env.GOOGLE_CLOUD_SHELL
  );
}

/**
 * Indicates whether or not this process is likely to be running in WSL.
 * @return true if we're likely in WSL, false otherwise
 */
export function isRunningInWSL(): boolean {
  return !!process.env.WSL_DISTRO_NAME;
}

/**
 * Indicates whether the end-user is running the CLI from a GitHub Action.
 */
export function isRunningInGithubAction(): boolean {
  return process.env.GITHUB_ACTION_REPOSITORY === "FirebaseExtended/action-hosting-deploy";
}

/**
 * Generates a date that is 30 days from Date.now()
 */
export function thirtyDaysFromNow(): Date {
  return new Date(Date.now() + THIRTY_DAYS_IN_MILLISECONDS);
}

/**
 * Verifies val is a string.
 */
export function assertIsString(val: unknown, message?: string): asserts val is string {
  if (typeof val !== "string") {
    throw new AssertionError({
      message: message || `expected "string" but got "${typeof val}"`,
    });
  }
}

/**
 * Verifies val is a number.
 */
export function assertIsNumber(val: unknown, message?: string): asserts val is number {
  if (typeof val !== "number") {
    throw new AssertionError({
      message: message || `expected "number" but got "${typeof val}"`,
    });
  }
}

/**
 * Assert val is a string or undefined.
 */
export function assertIsStringOrUndefined(
  val: unknown,
  message?: string,
): asserts val is string | undefined {
  if (!(val === undefined || typeof val === "string")) {
    throw new AssertionError({
      message: message || `expected "string" or "undefined" but got "${typeof val}"`,
    });
  }
}

/**
 * Polyfill for groupBy.
 */
export function groupBy<T, K extends string | number | symbol>(
  arr: T[],
  f: (item: T) => K,
): Record<K, T[]> {
  return arr.reduce(
    (result, item) => {
      const key = f(item);
      if (result[key]) {
        result[key].push(item);
      } else {
        result[key] = [item];
      }
      return result;
    },
    {} as Record<K, T[]>,
  );
}

function cloneArray<T>(arr: T[]): T[] {
  return arr.map((e) => cloneDeep(e));
}

function cloneObject<T extends Record<string, unknown>>(obj: T): T {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    clone[k] = cloneDeep(v);
  }
  return clone as T;
}

/**
 * replacement for lodash cloneDeep that preserves type.
 */
// TODO: replace with builtin once Node 18 becomes the min version.
export function cloneDeep<T>(obj: T): T {
  if (typeof obj !== "object" || !obj) {
    return obj;
  }
  if (obj instanceof RegExp) {
    return RegExp(obj, obj.flags) as typeof obj;
  }
  if (obj instanceof Date) {
    return new Date(obj) as typeof obj;
  }
  if (Array.isArray(obj)) {
    return cloneArray(obj) as typeof obj;
  }
  if (obj instanceof Map) {
    return new Map(obj.entries()) as typeof obj;
  }
  return cloneObject(obj as Record<string, unknown>) as typeof obj;
}

/**
 * Returns the last element in the array, or undefined if no array is passed or
 * the array is empty.
 */
export function last<T>(arr?: T[]): T {
  // The type system should never allow this, so return something that violates
  // the type system when passing in something that violates the type system.
  if (!Array.isArray(arr)) {
    return undefined as unknown as T;
  }
  return arr[arr.length - 1];
}

/**
 * Options for debounce.
 */
type DebounceOptions = {
  leading?: boolean;
};

/**
 * Returns a function that delays invoking `fn` until `delay` ms have
 * passed since the last time `fn` was invoked.
 */
export function debounce<T>(
  fn: (...args: T[]) => void,
  delay: number,
  { leading }: DebounceOptions = {},
): (...args: T[]) => void {
  let timer: NodeJS.Timeout;
  return (...args) => {
    if (!timer && leading) {
      fn(...args);
    }
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Returns a random number between min and max, inclusive.
 */
export function randomInt(min: number, max: number): number {
  min = Math.floor(min);
  max = Math.ceil(max) + 1;
  return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Return a connectable hostname, replacing wildcard 0.0.0.0 or :: with loopback
 * addresses 127.0.0.1 / ::1 correspondingly. See below for why this is needed:
 * https://github.com/firebase/firebase-tools-ui/issues/286
 *
 * This assumes that the consumer (i.e. client SDK, etc.) is located on the same
 * device as the Emulator hub (i.e. CLI), which may not be true on multi-device
 * setups, etc. In that case, the customer can work around this by specifying a
 * non-wildcard IP address (like the IP address on LAN, if accessing via LAN).
 */
export function connectableHostname(hostname: string): string {
  if (hostname === "0.0.0.0") {
    hostname = "127.0.0.1";
  } else if (hostname === "::" /* unquoted IPv6 wildcard */) {
    hostname = "::1";
  } else if (hostname === "[::]" /* quoted IPv6 wildcard */) {
    hostname = "[::1]";
  }
  return hostname;
}

/**
 * We wrap and export the open() function from the "open" package
 * to stub it out in unit tests.
 */
export async function openInBrowser(url: string): Promise<void> {
  await open(url);
}

/**
 * Like openInBrowser but opens the url in a popup.
 */
export async function openInBrowserPopup(
  url: string,
  buttonText: string,
): Promise<{ url: string; cleanup: () => void }> {
  const popupPage = readTemplateSync("popup.html")
    .replace("${url}", url)
    .replace("${buttonText}", buttonText);

  const port = await getPort();

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Length": popupPage.length,
      "Content-Type": "text/html",
    });
    res.end(popupPage);
    req.socket.destroy();
  });

  server.listen(port);

  const popupPageUri = `http://localhost:${port}`;
  await openInBrowser(popupPageUri);

  return {
    url: popupPageUri,
    cleanup: () => {
      server.close();
    },
  };
}

/**
 * Get hostname from a given url or null if the url is invalid
 */
export function getHostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch (e: unknown) {
    return null;
  }
}

/**
 * Retrieves a file from the directory.
 */
export function readFileFromDirectory(
  directory: string,
  file: string,
): Promise<{ source: string; sourceDirectory: string }> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path.resolve(directory, file), "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          return reject(
            new FirebaseError(`Could not find "${file}" in "${directory}"`, { original: err }),
          );
        }
        reject(
          new FirebaseError(`Failed to read file "${file}" in "${directory}"`, { original: err }),
        );
      } else {
        resolve(data);
      }
    });
  }).then((source) => {
    return {
      source,
      sourceDirectory: directory,
    };
  });
}

/**
 * Wrapps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
export function wrappedSafeLoad(source: string): any {
  try {
    return yaml.parse(source);
  } catch (err: unknown) {
    throw new FirebaseError(`YAML Error: ${getErrMsg(err)}`, { original: getError(err) });
  }
}

/**
 * Generate id meeting the following criterias:
 *  - Lowercase, digits, and hyphens only
 *  - Must begin with letter
 *  - Cannot end with hyphen
 */
export function generateId(n = 6): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const allChars = "01234567890-abcdefghijklmnopqrstuvwxyz";
  let id = letters[Math.floor(Math.random() * letters.length)];
  for (let i = 1; i < n; i++) {
    const idx = Math.floor(Math.random() * allChars.length);
    id += allChars[idx];
  }
  return id;
}

/**
 * Generate a password meeting the following criterias:
 *  - At least one lowercase, one uppercase, one number, and one special character.
 */
export function generatePassword(n = 20): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+~`|}{[]:;?><,./-=";
  const all = lower + upper + numbers + special;

  let pw = "";
  pw += lower[crypto.randomInt(lower.length)];
  pw += upper[crypto.randomInt(upper.length)];
  pw += numbers[crypto.randomInt(numbers.length)];
  pw += special[crypto.randomInt(special.length)];

  for (let i = 4; i < n; i++) {
    pw += all[crypto.randomInt(all.length)];
  }

  // Shuffle the password to randomize character order using Fisher-Yates shuffle
  const pwArray = pw.split("");
  for (let i = pwArray.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i);
    [pwArray[i], pwArray[j]] = [pwArray[j], pwArray[i]];
  }
  return pwArray.join("");
}

/**
 * Reads a secret value from either a file or a prompt.
 * If dataFile is falsy and this is a tty, uses prompt. Otherwise reads from dataFile.
 * If dataFile is - or falsy, this means reading from file descriptor 0 (e.g. pipe in)
 */
export function readSecretValue(prompt: string, dataFile?: string): Promise<string> {
  if ((!dataFile || dataFile === "-") && tty.isatty(0)) {
    return password({ message: prompt });
  }
  let input: string | number = 0;
  if (dataFile && dataFile !== "-") {
    input = dataFile;
  }
  try {
    return Promise.resolve(fs.readFileSync(input, "utf-8"));
  } catch (e: any) {
    if (e.code === "ENOENT") {
      throw new FirebaseError(`File not found: ${input}`, { original: e });
    }
    throw e;
  }
}

/**
 * Updates or creates a .gitignore file with the given entries in the given path
 */
export function updateOrCreateGitignore(dirPath: string, entries: string[]) {
  const gitignorePath = path.join(dirPath, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, entries.join("\n"));
    return;
  }

  let content = fs.readFileSync(gitignorePath, "utf-8");
  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += `\n${entry}\n`;
    }
  }

  fs.writeFileSync(gitignorePath, content);
}

/**
 * Prompts for a directory name, and reprompts if that path does not exist
 * N.B. Moved from the original prompt library to this file because it brings in a lot of
 * dependencies. Moved to "utils" because this file arleady brings in the world.
 */
export async function promptForDirectory(args: {
  message: string;
  config: Config;
  default?: boolean;
  relativeTo?: string;
}): Promise<string> {
  let dir: string = "";
  while (!dir) {
    const promptPath = await input(args.message);
    let target: string;
    if (args.relativeTo) {
      target = path.resolve(args.relativeTo, promptPath);
    } else {
      target = args.config.path(promptPath);
    }
    if (fileExistsSync(target)) {
      logger.error(
        `Expected a directory, but ${target} is a file. Please provide a path to a directory.`,
      );
    } else if (!dirExistsSync(target)) {
      logger.error(`Directory ${target} not found. Please provide a path to a directory`);
    } else {
      dir = target;
    }
  }
  return dir;
}

/*
 * Deeply compares two JSON-serializable objects.
 * It's a simplified version of a deep equal function, sufficient for comparing the structure
 * of the gemini-extension.json file. It doesn't handle special cases like RegExp, Date, or functions.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Returns a unique ID that's either `recommended` or `recommended-{i}`.
 * Avoid existing IDs.
 */
export function newUniqueId(recommended: string, existingIDs: string[]): string {
  let id = recommended;
  let i = 1;
  while (existingIDs.includes(id)) {
    id = `${recommended}-${i}`;
    i++;
  }
  return id;
}

/**
 * Checks if a command exists in the system.
 */
export function commandExistsSync(command: string): boolean {
  try {
    const isWindows = platform() === "win32";
    // For Windows, `where` is more appropriate. It also often outputs the path.
    // For Unix-like systems, `which` is standard.
    // The `2> nul` (Windows) or `2>/dev/null` (Unix) redirects stderr to suppress error messages.
    // The `>` nul / `>/dev/null` redirects stdout as we only care about the exit code.
    const commandToCheck = isWindows
      ? `where "${command}" > nul 2> nul`
      : `which "${command}" > /dev/null 2> /dev/null`;

    execSync(commandToCheck);
    return true; // If execSync doesn't throw, the command was found (exit code 0)
  } catch (error) {
    // If the command is not found, execSync will throw an error (non-zero exit code)
    return false;
  }
}

/**
 * Resolves `subPath` against `base` and ensures the result is contained within `base`.
 * Throws a FirebaseError with an optional message if the resolved path escapes `base`.
 */
export function resolveWithin(base: string, subPath: string, errMsg?: string): string {
  const abs = path.resolve(base, subPath);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FirebaseError(errMsg || `Path "${subPath}" must be within "${base}".`);
  }
  return abs;
}

/**
 * Splits comma and space separated argument into an array of strings.
 * This is used to hanlde cases where PowerShell replaces commas with spaces.
 */
export function splitArgumentBySeparator(argument: string): string[] {
  return argument.split(/[ ,]+/).filter((s) => s.length > 0);
}

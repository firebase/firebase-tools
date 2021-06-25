import * as clc from "cli-color";

import { configstore } from "../configstore";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { logBullet, logWarning } from "../utils";
import * as backend from "../deploy/functions/backend";
import * as deploymentTool from "../deploymentTool";
import * as envstore from "./envstore";
import * as getProjectId from "../getProjectId";
import * as helper from "../deploy/functions/functionsDeployHelper";

// Exported for testing-only
export const ENVSTORE_ID = "firebase-functions";
const ENVSTORE_INTERNAL_ID = "firebase-functions-internal";
const RESERVED_KEY_NAMES = [
  // Cloud Functions for Firebase
  "FIREBASE_CONFIG",
  // Cloud Functions:
  //   https://cloud.google.com/functions/docs/env-var#best_practices_and_reserved_environment_variables
  "FUNCTION_TARGET",
  "FUNCTION_SIGNATURE_TYPE",
  "K_SERVICE",
  "K_REVISION",
  "PORT",
  // Cloud Run:
  //   https://cloud.google.com/run/docs/reference/container-contract#env-vars
  "K_CONFIGURATION",
];
const CONFIGSTORE_KEY = "envstore";
const CONFIGSTORE_TTL = 1000 * 60 * 60 * 24; // 1 day
// TODO(taeold): Define default environment variables for functions somewhere else.

/**
 * Format environment variables into console-friendly strings.
 *
 * @param {Record<string, string>} envs Environment variables to format.
 * @return {string} Formatted string suitable for printing.
 */
export function formatEnv(envs: Record<string, string>): string {
  const s = [];
  for (const [k, v] of Object.entries(envs)) {
    s.push(`${k}=${v}`);
  }
  return s.join("\n");
}

/**
 * Validates string for use as an env var key.
 *
 * We restrict key names to ones that conform to POSIX standards.
 * This is more restrictive than what is allowed in Cloud Functions or Cloud Run.
 *
 * @param key {string} Key to validate
 */
export function validateKey(key: string): void {
  // key must not be one of the reserved key names.
  if (RESERVED_KEY_NAMES.includes(key)) {
    throw new FirebaseError(
      "Invalid environment variable name " + clc.bold(key) + ", is reserved for internal use."
    );
  }
  // Only allow subset of key names that conforms to POSIX standards for
  // environment variables:
  //   https://cloud.google.com/functions/docs/env-var#portability
  if (!/^[A-Z_][A-Z0-9_]+$/.test(key)) {
    throw new FirebaseError(
      "Invalid environment variable name " +
        clc.bold(key) +
        ", must start with an uppercase ASCII letter or underscore" +
        ", and then consist of uppercase ASCII letters, digits, and underscores."
    );
  }
  // Keys cannot contain the prefix X_GOOGLE_.
  if (key.startsWith("X_GOOGLE_")) {
    throw new FirebaseError(
      "Invalid environment variable name " +
        clc.bold(key) +
        ", cannot contain the prefix X_GOOGLE_."
    );
  }
}

/**
 * Parse list of strings in key=value format as an object.
 *
 * @param {string[]} args List of strings in key=value format.
 * @return {Record<string, string>} An object with key, value pairs.
 */
export function parseKvArgs(args: string[]): Record<string, string> {
  const envs: Record<string, string> = {};
  for (const arg of args) {
    const parts = arg.split("=");
    if (parts.length < 2) {
      throw new FirebaseError(`Invalid argument ${clc.bold(arg)}, must be in key=val format`);
    }
    const key = parts[0];
    validateKey(key);
    const val = parts.slice(1).join("="); // Val may have contained '='.
    envs[key] = val;
  }
  return envs;
}

/**
 * Get environment variables from the EnvStore Service.
 *
 * @return {Promise<Record<string, string>>} An object that contains environment variables.
 */
export async function getEnvs(projectId: string): Promise<Record<string, string>> {
  const envStore = await envstore.getStore(projectId, ENVSTORE_ID);
  return envStore.vars;
}

/**
 * Add environment variables to the EnvStore Service.
 *
 * @param {Record<string, string>} envs Environment variables to add.
 * @return {Promise<Record<string, string>>} An object with environment variables from the EnvStore.
 */
export async function addEnvs(
  projectId: string,
  envs: Record<string, string>
): Promise<Record<string, string>> {
  const envStore = await envstore.patchStore(projectId, ENVSTORE_ID, envs);
  return envStore.vars || {};
}

/**
 * Remove given keys from the EnvStore Service.
 *
 * @param {string[]} keys Keys of environment variables to remove.
 * @return {Promise<Record<string, string>>} An object with environment variables from the EnvStore.
 */
export async function removeKeys(
  projectId: string,
  keys: string[]
): Promise<Record<string, string>> {
  const envs: Record<string, string> = {};
  keys.forEach((key) => {
    envs[key] = "";
  });
  const envStore = await envstore.patchStore(projectId, ENVSTORE_ID, envs);
  return envStore.vars || {};
}

/**
 * Set environment variables in the EnvStore Service to the given set.
 *
 * This operation is destructive and deletes env vars not defined in the given
 * envs.
 *
 * @param {Record<string, string>} envs Environment variables to set.
 * @return {Promise<Record<string, string>>} An object with environment variables from the EnvStore.
 */
export async function setEnvs(
  projectId: string,
  envs: Record<string, string>
): Promise<Record<string, string>> {
  // TODO(taeold): setEnv operation comprises 2 API calls. It isn't an atomic
  // operation and may leave all env vars to be deleted but not set. setEnv
  // command is already designed to be destructive, and the outcome of partial
  // failure isn't too bad (users can simply try the command again). Regardless,
  // we should work with the EnvStore service team to develop an delete+create
  // transactionality.
  await envstore.deleteStore(projectId, ENVSTORE_ID);
  const envStore = await envstore.createStore(projectId, ENVSTORE_ID, envs);
  return envStore.vars || {};
}

/**
 * Remove all environment variables in the EnvStore Service.
 *
 * @return {Promise<Record<string, string>>} An object with environment variables from the EnvStore.
 */
export async function clearEnvs(projectId: string): Promise<Record<string, string>> {
  const envStore = await envstore.deleteStore(projectId, ENVSTORE_ID);
  return envStore.vars || {};
}

/**
 * Clone environment variables in fromProjectId to toProjectId.
 *
 * @param {string} fromProjectId Project to clone environment variables from.
 * @param {string} toProjectId Project to clone environment variables to.
 * @param {string[]} only List of keys to clone.
 * @param {string[]} except List of keys to exclude when cloning.
 * @return {Promise<Record<string, string>>} An object with environment variables from the EnvStore.
 */
export async function clone({
  fromProjectId,
  toProjectId,
  only,
  except,
}: {
  fromProjectId: string;
  toProjectId: string;
  only: string[];
  except: string[];
}): Promise<Record<string, string>> {
  if (only.length && except.length) {
    throw new FirebaseError("Cannot use both only and except at the same time.");
  }

  let filterFn: (k: string) => boolean;
  if (only.length) {
    filterFn = (k) => only.includes(k);
  } else {
    filterFn = (k) => !except.includes(k);
  }
  const envs: Record<string, string> = {};
  const fromEnvs = await getEnvs(fromProjectId);
  for (const [k, v] of Object.entries(fromEnvs)) {
    if (filterFn(k)) {
      envs[k] = v;
    }
  }
  return setEnvs(toProjectId, envs);
}

/**
 * Check if the EnvStore API is active by querying the server.
 *
 * This is an bespoke method of checking whether user has opted in
 * to activate the EnvStore API.
 *
 * We check for existance of non-emtpy ENV_ID=${ENVSTORE_INTERNAL_ID}
 * which is created when user "enables" the EnvStore API.
 */
async function checkServer(projectId: string): Promise<boolean> {
  const resp = await envstore.getStore(projectId, ENVSTORE_INTERNAL_ID);
  return !!resp.vars;
}

/**
 * Check if the EnvStore API is active by querying local cache.
 *
 * Active state is valid for {CONFIGSTORE_TTL}.
 */
function checkCache(projectId: string): boolean {
  const key = `${CONFIGSTORE_KEY}.${projectId}`;
  const check = configstore.get(key);
  if (check?.lastActiveAt) {
    const activeAt = new Date(check.lastActiveAt);
    const diff = Date.now() - activeAt.getTime();
    if (diff <= CONFIGSTORE_TTL) {
      return true;
    }
    // Clear expired cache entry.
    configstore.delete(key);
  }
  return false;
}

function setCache(projectId: string) {
  const key = `${CONFIGSTORE_KEY}.${projectId}`;
  configstore.set(key, { lastActiveAt: Date.now() });
}

/**
 * Check for active EnvStore API.
 */
export async function checkEnvStore(projectId: string): Promise<boolean> {
  if (checkCache(projectId)) {
    return true;
  }
  const checked = await checkServer(projectId);
  if (checked) {
    setCache(projectId);
    return true;
  }
  return false;
}

/**
 * Enable the EnvStore API.
 *
 * This is an bespoke method of "enabling" EnvStore API. We "enable" the
 * EnvStore API setting up a non-empty EnvStore ENV_ID=${ENVSTORE_INTERNAL_ID}.
 */
export async function enable(projectId: string): Promise<void> {
  await envstore.patchStore(projectId, ENVSTORE_INTERNAL_ID, { ENABLED: "1" });
  setCache(projectId);
}

/**
 * Lookup existing cloud functions and collect user-defined env variables.
 *
 * If user's project hasn't activated the EnvStore API, we consider
 * all non-default environment variable as "user-defined". The user-defined
 * env is significant because they will be removed on the next deploy following
 * EnvStore API activation.
 */
export async function getUserEnvs(
  projectId: string
): Promise<Record<string, backend.EnvironmentVariables>> {
  const have = await backend.existingBackend({ projectId, filters: [] }, /* forceRefresh= */ false);

  const fnEnvs: Record<string, backend.EnvironmentVariables> = {};
  for (const fn of have.cloudFunctions) {
    // Filter out non-CF3 function instances.
    if (!deploymentTool.isFirebaseManaged(fn.labels || {})) {
      continue;
    }
    // Filter out default environment variables.
    const uenvs = Object.entries(fn.environmentVariables || {})
      .filter(([k]) => !RESERVED_KEY_NAMES.includes(k))
      // we can't use `Object.fromEntries()`. Implemented below.
      .reduce((obj: backend.EnvironmentVariables, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {});
    if (Object.keys(uenvs).length > 0) {
      fnEnvs[helper.getFunctionLabel(fn)] = uenvs;
    }
  }
  return fnEnvs;
}

/**
 * Check if EnvStore API is enabled on the project.
 * If not enabled, prompt user to enable it.
 */
export async function ensureEnvStore(options: any): Promise<void> {
  const projectId = getProjectId(options);
  const isEnabled = await checkEnvStore(projectId);
  if (isEnabled) {
    return;
  }

  logBullet(
    "functions:env family of commands manages environment variables for your Cloud Functions for Firebase. " +
      "Learn more about this feature at https://firebase.google.com/docs/functions/env.\n"
  );

  logWarning(
    "By opting in to have Firebase manage your function's environment variables, " +
      "you may lose existing environment variables you've manually set up on your functions. " +
      "Also, any environment variables you subsequently set with the gcloud command line tool " +
      "or in the Google Cloud console will be overwritten or removed.\n"
  );

  const userEnvs = await getUserEnvs(projectId);
  if (Object.keys(userEnvs).length > 0) {
    let msg =
      "If you opt in, the following environment variables will be deleted on next deploy:\n";

    // Transform userEnvs into a string of form:
    //   helloWorld(us-central1): KEY1=VAL1, KEY2=VAL2
    //   hellWorld(us-east1): KEY3=VAL3
    msg += Object.entries(userEnvs)
      .map(([label, envs]) => {
        const envList = Object.entries(envs)
          .map(([k, v]) => clc.bold(`${k}=${v}`))
          .join(", ");
        return `\t${label}: ${envList}`;
      })
      .join("\n");

    // Transform userEnvs into a string of form:
    //   KEY1=VAL1 KEY2=VAL2 KEY3=VAL3...
    const allEnvs = Object.values(userEnvs).reduce((obj, next) => {
      return { ...obj, ...next };
    }, {});
    const allEnvsPairs = Object.entries(allEnvs)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");

    msg += "\n\nTo preserve these environment variable, run the following command after opt-in:\n";
    msg += clc.bold(`\tfirebase functions:env:add ${allEnvsPairs}\n`);
    logWarning(msg);
  }

  const proceed = await promptOnce({
    type: "confirm",
    name: "confirm",
    default: false,
    message: "Would you like to have Firebase manage your functions' environment variables?",
  });
  if (!proceed) {
    throw new FirebaseError("Must opt-in to use functions:env:* commands.", { exit: 1 });
  }
  return enable(projectId);
}

import * as clc from "cli-color";

import { FirebaseError } from "../error";
import * as envstore from "./envstore";

// Exported for testing-only
export const ENVSTORE_ID = "firebase-functions";
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
  if (/^X_GOOGLE_.*$/.test(key)) {
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
  args.forEach((arg) => {
    const parts = arg.split("=");
    if (parts.length < 2) {
      throw new FirebaseError(`Invalid argument ${clc.bold(arg)}, must be in key=val format`);
    }
    const key = parts[0];
    validateKey(key);
    const val = parts.slice(1).join("="); // Val may have contained '='.
    envs[key] = val;
  });
  return envs;
}

/**
 * Get environment variables from the EnvStore Service.
 *
 * @return {Promise<Record<string, string>>} An object that contains environment variables.
 */
export async function getEnvs(projectId: string): Promise<Record<string, string>> {
  const envStore = await envstore.getStore(projectId, ENVSTORE_ID);
  return envStore.vars || {};
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
export async function clone(
  fromProjectId: string,
  toProjectId: string,
  only: string[],
  except: string[]
): Promise<Record<string, string>> {
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
  Object.entries(fromEnvs).forEach(([k, v]) => {
    if (filterFn(k)) {
      envs[k] = v;
    }
  });
  return setEnvs(toProjectId, envs);
}

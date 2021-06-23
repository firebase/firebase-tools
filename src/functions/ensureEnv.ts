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

const ENVSTORE_INTERNAL_ID = "firebase-functions-internal";
const CONFIGSTORE_KEY = "envstore";
const CONFIGSTORE_TTL = 1000 * 60 * 60 * 24; /* 1 day */
const DEFAULT_ENV_KEYS = ["FIREBASE_CONFIG"];

/**
 * Check if the EnvStore API is active.
 *
 * This is an bespoke method of checking whether user has opted in
 * to activate EnvStore API.
 *
 * An EnvStore entry on ENV_ID=${ENVSTORE_INTERNAL_ID} is created when
 * user "activates" the EnvStore API. We check for its existence.
 */
async function _check(projectId: string): Promise<boolean> {
  const resp = await envstore.getStore(projectId, ENVSTORE_INTERNAL_ID);
  return !!resp.vars;
}

/**
 * Check if the EnvStore API is active.
 *
 * An active state is cached locally for {CONFIGSTORE_TTL}.
 */
export async function check(projectId: string): Promise<boolean> {
  // Check actice state from local cache.
  const cached = configstore.get(CONFIGSTORE_KEY) as { lastActiveAt: string } | undefined;
  if (cached?.lastActiveAt) {
    const activeAt = new Date(cached.lastActiveAt);
    const diff = Date.now() - activeAt.getTime();
    if (diff <= CONFIGSTORE_TTL) {
      return true;
    }
    configstore.delete(CONFIGSTORE_KEY);
  }

  // Query the EnvStore API to check active state.
  const checked = await _check(projectId);
  if (checked) {
    configstore.set(CONFIGSTORE_KEY, { lastActiveAt: Date.now() });
    return true;
  }
  return false;
}

/**
 * Attempt to enable the EnvStore API.
 *
 * This is an bespoke method of "enabling" EnvStore API. We "enable" the
 * EnvStore API setting up a non-empty EnvStore ENV_ID=${ENVSTORE_INTERNAL_ID}
 * with a non-empty collection of key-value pairs.
 */
export async function enable(projectId: string): Promise<void> {
  await envstore.patchStore(projectId, ENVSTORE_INTERNAL_ID, { ENABLED: "1" });
}

interface UserEnv {
  fnLabel: string;
  envs: Record<string, string>;
}

/**
 * Lookup existing cloud functions and collect user-defined env variables.
 *
 * If user's project hasn't already opted-in to functions:env, we consider
 * all non-default environment variable as "user-defined" (which will be deleted
 * once the env variables are managed via functions:env commands).
 */
async function getUserEnvs(projectId: string): Promise<UserEnv[]> {
  const have = await backend.existingBackend({ projectId, filters: [] }, /* forceRefresh= */ true);

  let fnEnvs: UserEnv[] = [];
  for (const fn of have.cloudFunctions) {
    // Filter out non CF3 function instances.
    if (!deploymentTool.isFirebaseManaged(fn.labels || {})) {
      continue;
    }
    let uenvs: Record<string, string> = {};
    const envs = fn.environmentVariables;
    if (envs && Object.keys(envs).length > 1) {
      // Collect non-default env variables to print.
      for (const [k, v] of Object.entries(envs)) {
        if (!DEFAULT_ENV_KEYS.includes(k)) {
          uenvs[k] = v;
        }
      }
      fnEnvs.push({ fnLabel: helper.getFunctionLabel(fn), envs: uenvs });
    }
  }
  return fnEnvs;
}

/**
 * Check if EnvStore API is enabled on the project.
 * If not enabled, prompt user to enable it.
 */
export async function ensure(options: any): Promise<void> {
  const projectId = getProjectId(options);
  const isEnabled = await check(projectId);
  if (isEnabled) {
    return;
  }

  logBullet(
    "functions:env family of commands manages environment variables for your Cloud Functions for Firebase. " +
      "Learn more about this feature at https://firebase.google.com/docs/functions/env.\n"
  );

  const userEnvs = await getUserEnvs(projectId);
  if (userEnvs.length > 0) {
    let msg =
      "By opt-ing in, the following environment variables will be deleted on next deploy:\n";

    const allKvs: Record<string, string> = {};
    for (const { fnLabel, envs } of userEnvs) {
      msg += `\t${fnLabel}: `;

      let kvs: string[] = [];
      for (const [k, v] of Object.entries(envs)) {
        kvs.push(clc.bold(`${k}=${v}`));
        allKvs[k] = v;
      }
      msg += `${kvs.join(", ")}\n`;
    }

    msg += "\nTo preserve these environment variable, run the following command after opt-in:\n";
    msg += clc.bold(
      `\tfirebase functions:env:add ${Object.entries(allKvs)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}\n`
    );

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

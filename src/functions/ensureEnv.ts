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
const CONFIGSTORE_TTL = 1000 * 60 * 60 * 24; // 1 day
// TODO(taeold): Define default environment variables for functions somewhere else.
const DEFAULT_ENV_KEYS = ["FIREBASE_CONFIG"];

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
      .filter(([k]) => !DEFAULT_ENV_KEYS.includes(k))
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

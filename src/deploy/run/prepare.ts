import { getAutoinitEnvVars } from "../../apphosting/utils";
import { FirebaseError, getErrStatus } from "../../error";
import { WebConfig } from "../../fetchWebSetup";
import { RunSingle } from "../../firebaseConfig";
import { getDefaultServiceAccount } from "../../gcp/computeEngine";
import * as resourceManager from "../../gcp/resourceManager";
import * as runv2 from "../../gcp/runv2";
import { getProjectNumber } from "../../getProjectNumber";
import * as managementApps from "../../management/apps";
import { Options } from "../../options";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION, BuildEnv, getBuildEnv, secretNames } from "./buildEnv";
import { prereqs } from "./prereqs";
import {
  FIREBASE_APP_ANNOTATION,
  getExistingService,
  getServiceConfigs,
  missingServiceMessage,
} from "./util";

const ADMIN_SDK_ROLE = "roles/firebase.sdkAdminServiceAgent";

/**
 * Reads each service's current state from Cloud Run and resolves its base image and build env.
 */
export async function prepare(context: Context, options: Options, payload: Payload): Promise<void> {
  const configs = getServiceConfigs(options);
  if (!configs.length) {
    return;
  }
  await prereqs(context.projectId);
  payload.run = { services: [] };
  for (const config of configs) {
    payload.run.services.push(await prepareService(context, config));
  }
}

async function prepareService(context: Context, config: RunSingle): Promise<ServiceDeploy> {
  const { serviceId, region } = config;
  if (!region) {
    throw new FirebaseError(`Cloud Run service ${serviceId} is missing a region in firebase.json.`);
  }
  const existing = await getExistingService(context.projectId, region, serviceId);
  // Base images are sticky: deploys reuse the service's current base image unless told otherwise.
  const baseImage =
    context.baseImage === undefined
      ? existing?.template.containers?.[0]?.baseImageUri
      : context.baseImage || undefined;
  // App IDs are sticky: deploys reuse the service's current Firebase Web App unless told otherwise.
  const appId =
    context.appId === undefined
      ? existing?.annotations?.[FIREBASE_APP_ANNOTATION]
      : context.appId || undefined;

  const autoInitEnv = await resolveAutoInitEnv(
    serviceId,
    appId,
    existing,
    Boolean(context.appId && context.appId !== existing?.annotations?.[FIREBASE_APP_ANNOTATION]),
  );
  if (autoInitEnv) {
    await ensureAutoInitIam(context, existing);
  }
  const userBuildEnv = getBuildEnv(existing);
  if (Object.keys(userBuildEnv).length) {
    logLabeledBullet(
      "run",
      `Using build environment variables from ${BUILD_ENV_ANNOTATION}: ${Object.keys(userBuildEnv).join(", ")}`,
    );
  }
  const buildEnv: BuildEnv = { ...autoInitEnv, ...userBuildEnv };

  const svc: ServiceDeploy = {
    config,
    existing,
    baseImage,
    appId,
    ...(autoInitEnv?.FIREBASE_CONFIG && { firebaseConfig: autoInitEnv.FIREBASE_CONFIG }),
    ...(Object.keys(buildEnv).length > 0 ? { buildEnv } : {}),
  };
  if (!config.localBuild) {
    const secrets = secretNames(buildEnv);
    if (secrets.length) {
      throw new FirebaseError(
        `Service ${serviceId} has build secrets (${secrets.join(", ")}), which builds on ` +
          `Cloud Build don't support yet. To use them, build locally by setting "localBuild": true ` +
          `for this service in firebase.json.`,
      );
    }
    return svc;
  }

  if (!baseImage) {
    if (!existing && context.baseImage === undefined) {
      throw new FirebaseError(missingServiceMessage(config));
    }
    throw new FirebaseError(
      `Local builds require a base image. Set one for service ${serviceId} with ` +
        `"firebase run:services:update ${serviceId} --base-image <baseImage>".`,
    );
  }
  return svc;
}

/**
 * Fetches Firebase Web App config for SDK auto-initialization, respecting any user-configured
 * overrides on the container's runtime environment unless a new appId is being set.
 */
async function resolveAutoInitEnv(
  serviceId: string,
  appId: string | undefined,
  existing: runv2.Service | undefined,
  requireValidApp: boolean,
): Promise<Record<string, string> | undefined> {
  if (!appId) {
    return undefined;
  }
  try {
    const webappConfig = (await managementApps.getAppConfig(
      appId,
      managementApps.AppPlatform.WEB,
    )) as WebConfig;
    const autoinitVars = getAutoinitEnvVars(webappConfig);
    if (appId === existing?.annotations?.[FIREBASE_APP_ANNOTATION]) {
      for (const env of existing?.template.containers?.[0]?.env || []) {
        if (Object.prototype.hasOwnProperty.call(autoinitVars, env.name)) {
          if ("value" in env && env.value !== undefined) {
            autoinitVars[env.name] = env.value;
          } else {
            delete autoinitVars[env.name];
          }
        }
      }
    }
    return Object.keys(autoinitVars).length ? autoinitVars : undefined;
  } catch (err: unknown) {
    if (requireValidApp) {
      throw new FirebaseError(
        `Unable to lookup details for Firebase Web App ${appId} on service ${serviceId}.`,
        { original: err instanceof Error ? err : undefined },
      );
    }
    logLabeledWarning(
      "run",
      `Unable to lookup details for Firebase Web App ${appId} on service ${serviceId}. Firebase SDK autoinit will not be available.`,
    );
    return undefined;
  }
}

/**
 * Ensures the service's runtime service account has the IAM role needed for Firebase Admin SDK
 * auto-initialization.
 */
async function ensureAutoInitIam(
  context: Context,
  existing: runv2.Service | undefined,
): Promise<void> {
  const serviceAccount =
    existing?.template?.serviceAccount ||
    (await getDefaultServiceAccount(await getProjectNumber(context)));
  try {
    if (
      await resourceManager.serviceAccountHasRoles(
        context.projectId,
        serviceAccount,
        [ADMIN_SDK_ROLE],
        /* skipAccountLookup= */ true,
      )
    ) {
      return;
    }
    logLabeledWarning(
      "run",
      `Service account ${serviceAccount} is missing role ${ADMIN_SDK_ROLE} required for Firebase Admin SDK auto-initialization. Granting ${ADMIN_SDK_ROLE} to ${serviceAccount}...`,
    );
    await resourceManager.addServiceAccountToRoles(
      context.projectId,
      serviceAccount,
      [ADMIN_SDK_ROLE],
      /* skipAccountLookup= */ true,
    );
  } catch (err: unknown) {
    if (getErrStatus(err) === 403) {
      logLabeledWarning(
        "run",
        `Failed to grant ${ADMIN_SDK_ROLE} to ${serviceAccount}. Make sure you have the resourcemanager.projects.setIamPolicy permission.`,
      );
    } else {
      throw err;
    }
  }
}

import { getAutoinitEnvVars } from "../../apphosting/utils";
import { FirebaseError, getErrMsg, getError, getErrStatus } from "../../error";
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

  let autoInitEnv: Record<string, string> = {};
  if (appId) {
    autoInitEnv = await resolveAutoInitEnv(serviceId, appId, existing);
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
    firebaseConfig: autoInitEnv.FIREBASE_CONFIG,
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
 * Returns the env vars that let Firebase SDKs auto-initialize with the service's Firebase Web App:
 * FIREBASE_WEBAPP_CONFIG (the app's config, for the client SDK) and FIREBASE_CONFIG (the part of
 * it the Admin SDK reads).
 */
async function resolveAutoInitEnv(
  serviceId: string,
  appId: string,
  existing: runv2.Service | undefined,
): Promise<Record<string, string>> {
  const autoInitEnv = getAutoinitEnvVars(await getWebAppConfig(serviceId, appId));
  // Env vars set on the container take precedence, unless the service is being linked to a
  // different app: then they were meant for the old one.
  if (appId === existing?.annotations?.[FIREBASE_APP_ANNOTATION]) {
    applyContainerOverrides(autoInitEnv, existing.template.containers?.[0]?.env);
  }
  return autoInitEnv;
}

/**
 * Fetches the Firebase Web App's config. Fails instead of deploying a service that can't
 * auto-initialize Firebase SDKs.
 */
async function getWebAppConfig(serviceId: string, appId: string): Promise<WebConfig> {
  try {
    return (await managementApps.getAppConfig(appId, managementApps.AppPlatform.WEB)) as WebConfig;
  } catch (err: unknown) {
    throw new FirebaseError(
      `Unable to look up Firebase Web App ${appId} for service ${serviceId}: ${getErrMsg(err)}\n` +
        `To use a different app, run "firebase run:services:update ${serviceId} --app <appId>". ` +
        `To deploy without Firebase SDK auto-initialization, run ` +
        `"firebase run:services:update ${serviceId} --clear-app".`,
      { original: getError(err) },
    );
  }
}

/**
 * Lets env vars set on the container override the matching auto-init vars. A secret-backed var
 * can't be read here, so it's dropped and the container keeps its secret.
 */
function applyContainerOverrides(
  autoInitEnv: Record<string, string>,
  containerEnv: runv2.Container["env"] = [],
): void {
  for (const env of containerEnv) {
    if (!Object.prototype.hasOwnProperty.call(autoInitEnv, env.name)) {
      continue;
    }
    if ("value" in env) {
      autoInitEnv[env.name] = env.value;
    } else {
      delete autoInitEnv[env.name];
    }
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
        `Failed to grant ${ADMIN_SDK_ROLE} to ${serviceAccount}. Make sure you have the resourcemanager.projects.setIamPolicy permission, or ask an admin to grant this role.`,
      );
    } else {
      throw err;
    }
  }
}

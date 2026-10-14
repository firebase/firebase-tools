import { webApps } from "../../apphosting/app";
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
import { BUILD_ENV_ANNOTATION, getBuildEnv, secretNames } from "./buildEnv";
import { prereqs } from "./prereqs";
import {
  FIREBASE_APP_ANNOTATION,
  getExistingService,
  getServiceConfigs,
  mainContainer,
} from "./util";

const ADMIN_SDK_ROLE = "roles/firebase.sdkAdminServiceAgent";

/**
 * Reads each service's current state from Cloud Run and resolves its base image, build env, and
 * linked Firebase Web App.
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
  const existing = await getExistingService(context.projectId, region, serviceId);
  // Base images are sticky: keep the service's current one unless the context sets a new one or
  // clears it (null).
  let baseImage = mainContainer(existing?.template)?.baseImageUri;
  if (context.baseImage !== undefined) {
    baseImage = context.baseImage ?? undefined;
  }
  // Linked Firebase Web Apps are sticky the same way.
  let appId = existing?.annotations?.[FIREBASE_APP_ANNOTATION];
  if (context.appId !== undefined) {
    appId = context.appId ?? undefined;
  }
  // Local builds run on top of the base image, so they need one.
  if (config.localBuild && !baseImage) {
    const fix = existing
      ? `firebase run:services:update ${serviceId} --region ${region} --base-image <baseImage>`
      : "firebase init run";
    throw new FirebaseError(
      `Local builds require a base image. Set one for service ${serviceId} in ${region} with "${fix}".`,
    );
  }

  const buildEnv = getBuildEnv(existing);
  const secrets = secretNames(buildEnv);
  // Only local builds can use secrets: they read them on your machine, with your credentials.
  // Builds on Cloud Build only take plain values, and passing a secret's value there would store
  // it in plain text in the build.
  if (secrets.length && !config.localBuild) {
    throw new FirebaseError(
      `Service ${serviceId} in ${region} has build secrets (${secrets.join(", ")}), but only ` +
        `local builds can use secrets: builds on Cloud Build only take plain values. To use ` +
        `them, set "localBuild": true for this service in firebase.json.`,
    );
  }

  const svc: ServiceDeploy = { config, existing, baseImage };
  if (Object.keys(buildEnv).length) {
    logLabeledBullet(
      "run",
      `Using build environment variables for service ${serviceId} in ${region} from ` +
        `${BUILD_ENV_ANNOTATION}: ${Object.keys(buildEnv).join(", ")}`,
    );
    svc.buildEnv = buildEnv;
  }
  if (appId) {
    // Firebase SDKs auto-initialize from the app's config. The build gets both config env vars (the
    // build env annotation can override them), and the container gets FIREBASE_CONFIG.
    const autoInitEnv = getAutoinitEnvVars(await getWebAppConfig(context, config, appId));
    await ensureAutoInitIam(context, existing);
    svc.appId = appId;
    svc.firebaseConfig = autoInitEnv.FIREBASE_CONFIG;
    svc.buildEnv = { ...autoInitEnv, ...buildEnv };
  }
  return svc;
}

/**
 * Fetches the Firebase Web App's config. Fails instead of deploying a service that can't
 * auto-initialize Firebase SDKs, so a deploy never saves an app ID that doesn't work.
 */
async function getWebAppConfig(
  context: Context,
  config: RunSingle,
  appId: string,
): Promise<WebConfig> {
  try {
    // Check that the project has this app, the same way App Hosting's --app does (given an app ID,
    // getOrCreateWebApp only looks it up). The config lookup below doesn't catch a bad ID: for an
    // ID with no app, it returns the project's config, without an appId.
    await webApps.getOrCreateWebApp(context.projectId, appId, config.serviceId);
    return (await managementApps.getAppConfig(appId, managementApps.AppPlatform.WEB)) as WebConfig;
  } catch (err: unknown) {
    const update = `firebase run:services:update ${config.serviceId} --region ${config.region}`;
    throw new FirebaseError(
      `Unable to look up Firebase Web App ${appId} for service ${config.serviceId} in ` +
        `${config.region}: ${getErrMsg(err)}\n` +
        `To use a different app, run "${update} --app <appId>". ` +
        `To deploy without Firebase SDK auto-initialization, run "${update} --clear-app".`,
      { original: getError(err) },
    );
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

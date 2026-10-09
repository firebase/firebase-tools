import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION, getBuildEnv, secretNames } from "./buildEnv";
import { prereqs } from "./prereqs";
import {
  fullServiceName,
  getExistingService,
  getServiceConfigs,
  missingServiceMessage,
} from "./util";

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
  const existing = await getExistingService(context.projectId, region, serviceId);
  // Base images are sticky: deploys reuse the service's current base image unless told otherwise.
  const baseImage =
    context.baseImage === undefined
      ? existing?.template.containers?.[0]?.baseImageUri
      : context.baseImage || undefined;

  const buildEnv = getBuildEnv(existing);
  if (Object.keys(buildEnv).length) {
    logLabeledBullet(
      "run",
      `Using build environment variables for service ${serviceId} in ${region} from ` +
        `${BUILD_ENV_ANNOTATION}: ${Object.keys(buildEnv).join(", ")}`,
    );
  }

  const svc: ServiceDeploy = { config, existing, baseImage };
  if (Object.keys(buildEnv).length) {
    svc.buildEnv = buildEnv;
  }
  if (!config.localBuild) {
    const secrets = secretNames(buildEnv);
    if (secrets.length) {
      throw new FirebaseError(
        `Service ${serviceId} in ${region} has build secrets (${secrets.join(", ")}), which ` +
          `builds on Cloud Build don't support yet. To use them, build locally by setting ` +
          `"localBuild": true for this service in firebase.json.`,
      );
    }
    return svc;
  }

  if (!baseImage) {
    if (!existing && context.baseImage === undefined) {
      throw new FirebaseError(missingServiceMessage(config));
    }
    throw new FirebaseError(
      `Local builds require a base image. Set one for service ${serviceId} in ${region} with ` +
        `"firebase run:services:update ${fullServiceName(config)} --base-image <baseImage>".`,
    );
  }
  return svc;
}

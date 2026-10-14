import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION, getBuildEnv, secretNames } from "./buildEnv";
import { prereqs } from "./prereqs";
import { getExistingService, getServiceConfigs, mainContainer } from "./util";

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
  // Base images are sticky: keep the service's current one unless the context sets a new one or
  // clears it (null).
  let baseImage = mainContainer(existing?.template)?.baseImageUri;
  if (context.baseImage !== undefined) {
    baseImage = context.baseImage ?? undefined;
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
  return svc;
}

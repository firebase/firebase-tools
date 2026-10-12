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
  // Local builds read secrets with your credentials. Cloud Build can't read them yet.
  if (secrets.length && !config.localBuild) {
    throw new FirebaseError(
      `Service ${serviceId} in ${region} has build secrets (${secrets.join(", ")}), which ` +
        `builds on Cloud Build don't support yet. To use them, build locally by setting ` +
        `"localBuild": true for this service in firebase.json.`,
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

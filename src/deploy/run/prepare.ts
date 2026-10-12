import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { Context, Payload, ServiceDeploy } from "./args";
import { prereqs } from "./prereqs";
import { fullServiceName, getExistingService, getServiceConfigs, mainContainer } from "./util";

/**
 * Reads each service's current state from Cloud Run and resolves its base image.
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
      ? `firebase run:services:update ${fullServiceName(config)} --base-image <baseImage>`
      : "firebase init run";
    throw new FirebaseError(
      `Local builds require a base image. Set one for service ${serviceId} in ${region} with "${fix}".`,
    );
  }
  return { config, existing, baseImage };
}

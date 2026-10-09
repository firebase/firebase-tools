import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { Context, Payload, ServiceDeploy } from "./args";
import { prereqs } from "./prereqs";
import { getExistingService, getServiceConfigs } from "./util";

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
  const existing = await getExistingService(context.projectId, config.region, config.serviceId);
  // Base images are sticky: deploys reuse the service's current base image unless told otherwise.
  const baseImage =
    context.baseImage === undefined
      ? existing?.template.containers?.[0]?.baseImageUri
      : context.baseImage || undefined;
  return { config, existing, baseImage };
}

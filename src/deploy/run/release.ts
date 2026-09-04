import { Options } from "../../options";
import { logger } from "../../logger";
import { Context, Payload } from "./args";

/**
 * Releases Cloud Run deployment by logging the deployed service URL.
 */
export async function release(context: Context, options: Options, payload: Payload): Promise<void> {
  if (!payload.run?.services) return;

  for (const service of payload.run.services) {
    if (service.deployResponse?.uri) {
      logger.info(`Service ${service.serviceId} is available at ${service.deployResponse.uri}`);
    }
  }
}

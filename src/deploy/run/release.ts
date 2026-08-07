import { Options } from "../../options";
import { logger } from "../../logger";
import * as gcs from "../../gcp/storage";
import { Context, Payload } from "./args";

/**
 * Releases Cloud Run deployment by cleaning up temporary staging artifacts in Cloud Storage
 * and logging the deployed service URL.
 */
export async function release(context: Context, options: Options, payload: Payload): Promise<void> {
  if (!payload.run?.services) return;

  for (const service of payload.run.services) {
    if (service.storageSource) {
      try {
        await gcs.deleteObject(`/${service.storageSource.bucket}/${service.storageSource.object}`);
        logger.debug(
          `Deleted source archive from GCS: gs://${service.storageSource.bucket}/${service.storageSource.object}`,
        );
      } catch (err: unknown) {
        logger.debug(
          `Failed to delete source archive: gs://${service.storageSource.bucket}/${service.storageSource.object}`,
          err,
        );
      }
    }

    if (service.deployResponse?.uri) {
      logger.info(`Service ${service.serviceId} is available at ${service.deployResponse.uri}`);
    }
  }
}

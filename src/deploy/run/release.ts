import { Options } from "../../options";
import { logger } from "../../logger";
import * as gcs from "../../gcp/storage";

/**
 *
 */
export async function release(context: any, options: Options, payload: any): Promise<void> {
  if (!payload.run?.services) return;

  for (const service of payload.run.services) {
    if (service.storageSource) {
      try {
        await gcs.deleteObject(`/${service.storageSource.bucket}/${service.storageSource.object}`);
        logger.debug(
          `Deleted source archive from GCS: gs://${service.storageSource.bucket}/${service.storageSource.object}`,
        );
      } catch (err) {
        logger.debug(
          `Failed to delete source archive: gs://${service.storageSource.bucket}/${service.storageSource.object}`,
          err,
        );
      }
    }

    if (service.deployResponse && service.deployResponse.uri) {
      logger.info(`Service ${service.serviceId} is available at ${service.deployResponse.uri}`);
    }
  }
}

import { getErrStatus } from "../../error";
import * as runv2 from "../../gcp/runv2";

/**
 * Gets a Cloud Run service, or undefined if it doesn't exist yet.
 */
export async function getExistingService(
  projectId: string,
  region: string,
  serviceId: string,
): Promise<runv2.Service | undefined> {
  try {
    return await runv2.getService(projectId, region, serviceId);
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      return undefined;
    }
    throw err;
  }
}

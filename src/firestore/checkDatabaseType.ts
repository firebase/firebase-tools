import * as api from "../api";
import { logger } from "../logger";

/**
 * Determine the Firestore database type for a given project. One of:
 *   - DATABASE_TYPE_UNSPECIFIED (unspecified)
 *   - CLOUD_DATASTORE (Datastore legacy)
 *   - CLOUD_FIRESTORE (Firestore native mode)
 *   - CLOUD_DATASTORE_COMPATIBILITY (Firestore datastore mode)
 *
 * @param projectId the Firebase project ID.
 */
export async function checkDatabaseType(projectId: string): Promise<string | undefined> {
  try {
    const resp = await api.request("GET", "/v1/apps/" + projectId, {
      auth: true,
      origin: api.appengineOrigin,
    });

    return resp.body.databaseType;
  } catch (err: any) {
    logger.debug("error getting database type", err);
    return undefined;
  }
}

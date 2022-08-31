import { appengineOrigin } from "../api";
import { Client } from "../apiv2";
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
    const client = new Client({ urlPrefix: appengineOrigin, apiVersion: "v1" });
    const resp = await client.get<{ databaseType?: string }>(`/apps/${projectId}`);
    return resp.body.databaseType;
  } catch (err: any) {
    logger.debug("error getting database type", err);
    return undefined;
  }
}

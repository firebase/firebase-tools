import { firestoreOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";

/**
 * Determine the Firestore database type for a given project. One of:
 *   - DATABASE_TYPE_UNSPECIFIED (unspecified)
 *   - DATASTORE_MODE(Datastore legacy)
 *   - FIRESTORE_NATIVE (Firestore native mode)
 *
 * @param projectId the Firebase project ID.
 */
export async function checkDatabaseType(
  projectId: string,
): Promise<"DATASTORE_MODE" | "FIRESTORE_NATIVE" | "DATABASE_TYPE_UNSPECIFIED" | undefined> {
  try {
    const client = new Client({ urlPrefix: firestoreOrigin, apiVersion: "v1" });
    const resp = await client.get<{
      type?: "DATASTORE_MODE" | "FIRESTORE_NATIVE" | "DATABASE_TYPE_UNSPECIFIED";
    }>(`/projects/${projectId}/databases/(default)`);
    return resp.body.type;
  } catch (err: any) {
    logger.debug("error getting database type", err);
    return undefined;
  }
}

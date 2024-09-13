import { firestoreOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";

/**
 * Determine the Firestore database type for a given project. One of:
 *   - DATABASE_TYPE_UNSPECIFIED (unspecified)
 *   - DATASTORE_MODE(Datastore legacy)
 *   - FIRESTORE_NATIVE (Firestore native mode)
 *   - DATABASE_DOES_NOT_EXIST (Database does not exist on specified project)
 *
 * @param projectId the Firebase project ID.
 * @param databaseId the Firestore database ID.
 */
export async function checkDatabaseType(
  projectId: string,
  databaseId: string = "(default)",
): Promise<
  | "DATASTORE_MODE"
  | "FIRESTORE_NATIVE"
  | "DATABASE_TYPE_UNSPECIFIED"
  | "DATABASE_DOES_NOT_EXIST"
  | undefined
> {
  try {
    const client = new Client({ urlPrefix: firestoreOrigin(), apiVersion: "v1" });
    const resp = await client.get<{
      type?: "DATASTORE_MODE" | "FIRESTORE_NATIVE" | "DATABASE_TYPE_UNSPECIFIED";
    }>(`/projects/${projectId}/databases/${databaseId}`);
    return resp.body.type;
  } catch (err: any) {
    logger.debug("error getting database type: ", err);
    if (err instanceof FirebaseError) {
      if (err.status === 404) {
        logger.info(`${databaseId} does not exist in project ${projectId}.`);
        return "DATABASE_DOES_NOT_EXIST";
      }
    }
    return undefined;
  }
}

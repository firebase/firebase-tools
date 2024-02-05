import * as backend from "../backend";
import * as firestore from "../../../gcp/firestore";
import { FirebaseError } from "../../../error";

const dbCache = new Map<string, firestore.Database>();

/**
 * A memoized version of firestore.getDatabase that avoids repeated calls to the API.
 *
 * @param project the project ID
 * @param databaseId the database ID or "(default)"
 */
async function getDatabase(project: string, databaseId: string): Promise<firestore.Database> {
  const key = `${project}/${databaseId}`;
  if (dbCache.has(key)) {
    return dbCache.get(key)!;
  }
  const db = await firestore.getDatabase(project, databaseId);
  dbCache.set(key, db);
  return db;
}

/**
 * Sets a firestore event trigger's region to the firestore database region.
 * @param endpoint the firestore endpoint
 */
export async function ensureFirestoreTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  const db = await getDatabase(
    endpoint.project,
    endpoint.eventTrigger.eventFilters?.database || "(default)",
  );
  const dbRegion = db.locationId;
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = dbRegion;
  }
  if (endpoint.eventTrigger.region !== dbRegion) {
    throw new FirebaseError(
      "A firestore trigger location must match the firestore database region.",
    );
  }
}

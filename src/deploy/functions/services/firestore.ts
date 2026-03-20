import * as backend from "../backend";
import * as firestore from "../../../gcp/firestore";
import { FirebaseError } from "../../../error";

const dbCache = new Map<string, firestore.Database>();
const dbPromiseCache = new Map<string, Promise<firestore.Database>>();

/**
 * Clear the database cache. Used for testing.
 * @internal
 */
export function clearCache(): void {
  dbCache.clear();
  dbPromiseCache.clear();
}

/**
 * A memoized version of firestore.getDatabase that avoids repeated calls to the API.
 * This implementation prevents concurrent calls for the same database.
 *
 * @param project the project ID
 * @param databaseId the database ID or "(default)"
 */
async function getDatabase(project: string, databaseId: string): Promise<firestore.Database> {
  const key = `${project}/${databaseId}`;

  if (dbCache.has(key)) {
    return dbCache.get(key)!;
  }

  if (dbPromiseCache.has(key)) {
    return dbPromiseCache.get(key)!;
  }

  const dbPromise = firestore
    .getDatabase(project, databaseId)
    .then((db) => {
      dbCache.set(key, db);
      dbPromiseCache.delete(key);
      return db;
    })
    .catch((error) => {
      dbPromiseCache.delete(key);
      throw error;
    });

  dbPromiseCache.set(key, dbPromise);
  return dbPromise;
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

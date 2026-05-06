import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import {
  getDatabaseInstanceDetails as getDetails,
  DatabaseInstance,
} from "../../../management/database";

const instanceCache = new Map<string, DatabaseInstance>();

/**
 * Clear the database instance cache. Used for testing.
 * @internal
 */
export function clearCache(): void {
  instanceCache.clear();
}

/**
 * A memoized version of getDatabaseInstanceDetails that avoids repeated calls to the API.
 *
 * @param projectId the project ID
 * @param instanceName the database instance ID
 */
export async function getDatabaseInstanceDetails(
  projectId: string,
  instanceName: string,
): Promise<DatabaseInstance> {
  const key = `${projectId}/${instanceName}`;

  if (instanceCache.has(key)) {
    return instanceCache.get(key)!;
  }

  const details = await getDetails(projectId, instanceName);
  instanceCache.set(key, details);
  return details;
}

/**
 * Sets a database event trigger's region to the function region.
 * @param endpoint the database endpoint
 */
export function ensureDatabaseTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = endpoint.region;
  }
  if (endpoint.eventTrigger.region !== endpoint.region) {
    throw new FirebaseError("A database trigger location must match the function region.");
  }
  return Promise.resolve();
}

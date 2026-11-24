import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import * as build from "../build";
import {
  getDatabaseInstanceDetails as getDetails,
  DatabaseInstance,
  DatabaseLocation,
} from "../../../management/database";
import { logger } from "../../../logger";

const instanceCache = new Map<string, Promise<DatabaseInstance>>();

/**
 * Clear the database instance cache. Used for testing.
 * @internal
 */
export function clearCache(): void {
  instanceCache.clear();
}

/**
 * A memoized version of getDatabaseInstanceDetails that avoids repeated calls to the API.
 * Concurrent calls for the same instance share one request. A failed request is not cached.
 *
 * @param projectId the project ID
 * @param instanceName the database instance ID
 */
export function getDatabaseInstanceDetails(
  projectId: string,
  instanceName: string,
): Promise<DatabaseInstance> {
  const key = `${projectId}/${instanceName}`;

  let details = instanceCache.get(key);
  if (!details) {
    details = getDetails(projectId, instanceName).catch((err: unknown) => {
      instanceCache.delete(key);
      throw err;
    });
    instanceCache.set(key, details);
  }
  return details;
}

/**
 * Sets an unset database event trigger's region. A trigger on a named instance gets the
 * region of that instance. Any other trigger gets the function region.
 * @param endpoint the database endpoint
 */
export async function ensureDatabaseTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  const { eventTrigger } = endpoint;
  if (eventTrigger.region) {
    return;
  }
  eventTrigger.region = (await lookupInstanceLocation(endpoint)) ?? endpoint.region;
}

async function lookupInstanceLocation(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<string | undefined> {
  const { eventTrigger } = endpoint;
  const instanceName =
    eventTrigger.eventFilters?.instance ?? eventTrigger.eventFilterPathPatterns?.instance;
  // A path pattern can match instances in more than one location.
  if (!instanceName || instanceName.includes("*")) {
    return undefined;
  }
  try {
    const details = await getDatabaseInstanceDetails(endpoint.project, instanceName);
    if (details.location && details.location !== DatabaseLocation.ANY) {
      return details.location.toLowerCase();
    }
  } catch (err: unknown) {
    logger.debug(
      `Could not find the location of database instance ${instanceName}. ` +
        `The trigger for function ${endpoint.id} will use the function region ${endpoint.region}:`,
      err,
    );
  }
  return undefined;
}

/**
 * Get the default region for a Realtime Database event trigger.
 */
export async function getDefaultRegion(endpoint: build.Endpoint): Promise<string> {
  if (!build.isEventTriggered(endpoint)) {
    throw new FirebaseError("Database getDefaultRegion requires an event-triggered endpoint");
  }
  if (endpoint.eventTrigger.region) {
    return endpoint.eventTrigger.region;
  }

  const instanceName = endpoint.eventTrigger.eventFilters?.instance;
  if (instanceName) {
    const details = await getDatabaseInstanceDetails(endpoint.project, instanceName);
    if (details.location && details.location !== "-") {
      return details.location.toLowerCase();
    }
  }
  throw new FirebaseError("Could not resolve database instance location");
}

import * as backend from "./backend";
import { serviceForEndpoint } from "./services";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { getBucket } from "./services/storage";
import { getDatabase } from "./services/firestore";
import { getDatabaseInstanceDetails } from "./services/database";

/**
 * Ensures the trigger regions are set and correct
 * @param want the list of function specs we want to deploy
 */
export async function ensureTriggerRegions(want: backend.Backend): Promise<void> {
  const regionLookups: Array<Promise<void>> = [];
  const triggerRegionMap = new Map<string, string>();

  for (const ep of backend.allEndpoints(want)) {
    if (!backend.isEventTriggered(ep)) {
      continue;
    }

    if (ep.platform === "gcfv1") {
      const eventType = ep.eventTrigger.eventType || "";
      const resource = ep.eventTrigger.eventFilters?.resource;
      if (eventType.includes("storage")) {
        const bucketName = extractBucketName(resource);
        if (bucketName) {
          regionLookups.push(
            getBucket(bucketName)
              .then((bucket) => {
                triggerRegionMap.set(backend.functionName(ep), bucket.location.toLowerCase());
              })
              .catch((err) => {
                logger.debug(
                  `Failed to resolve trigger region for V1 storage function ${ep.id}:`,
                  err,
                );
              }),
          );
        }
      } else if (eventType.includes("firestore")) {
        const dbId = extractDatabaseId(resource);
        regionLookups.push(
          getDatabase(ep.project, dbId)
            .then((db) => {
              triggerRegionMap.set(backend.functionName(ep), db.locationId.toLowerCase());
            })
            .catch((err) => {
              logger.debug(
                `Failed to resolve trigger region for V1 firestore function ${ep.id}:`,
                err,
              );
            }),
        );
      } else if (eventType.includes("database")) {
        const instanceName = extractInstanceName(resource);
        if (instanceName) {
          regionLookups.push(
            getDatabaseInstanceDetails(ep.project, instanceName)
              .then((details) => {
                if (details.location && details.location !== "-") {
                  triggerRegionMap.set(backend.functionName(ep), details.location.toLowerCase());
                }
              })
              .catch((err) => {
                logger.debug(
                  `Failed to resolve trigger region for V1 database function ${ep.id}:`,
                  err,
                );
              }),
          );
        }
      }
    } else {
      regionLookups.push(serviceForEndpoint(ep).ensureTriggerRegion(ep));
    }
  }
  await Promise.all(regionLookups);

  if (process.env.FIREBASE_SUPPRESS_REGION_WARNING === "true") {
    return;
  }

  const offendingFunctions: string[] = [];
  for (const ep of backend.allEndpoints(want)) {
    if (!backend.isEventTriggered(ep)) {
      continue;
    }

    let triggerRegion: string | undefined;
    if (ep.platform === "gcfv1") {
      triggerRegion = triggerRegionMap.get(backend.functionName(ep));
    } else {
      triggerRegion = ep.eventTrigger.region;
    }

    if (ep.region !== "us-central1" || !triggerRegion || triggerRegion === "global") {
      continue;
    }

    if (!isUSRegion(triggerRegion)) {
      offendingFunctions.push(`- ${ep.id} (us-central1, Trigger: ${triggerRegion})`);
    }
  }

  if (offendingFunctions.length > 0) {
    utils.logLabeledWarning(
      "functions",
      `The following functions have triggers in different regions than they are located:\n` +
        offendingFunctions.join("\n") +
        `\nTo avoid unnecessary cross-region network hops, consider assigning these functions to their trigger regions or collocating them. ` +
        `To suppress this warning, set FIREBASE_SUPPRESS_REGION_WARNING=true in your environment variables.`,
    );
  }
}

function extractBucketName(resource: string | undefined): string | null {
  if (!resource) return null;
  const match = /buckets\/([^/]+)/.exec(resource);
  if (match) return match[1];
  if (!resource.includes("/")) return resource;
  return null;
}

function extractDatabaseId(resource: string | undefined): string {
  if (!resource) return "(default)";
  const match = /databases\/([^/]+)/.exec(resource);
  if (match) return match[1];
  if (!resource.includes("/")) return resource;
  return "(default)";
}

function extractInstanceName(resource: string | undefined): string | null {
  if (!resource) return null;
  const match = /instances\/([^/]+)/.exec(resource);
  if (match) return match[1];
  if (!resource.includes("/")) return resource;
  return null;
}

function isUSRegion(region: string): boolean {
  return region === "us" || region.startsWith("nam") || region.startsWith("us-");
}

import * as backend from "./backend";
import { serviceForEndpoint } from "./services";

/**
 * Ensures the trigger regions are set and correct
 * @param want the list of function specs we want to deploy
 * @param have the list of function specs we have deployed
 */
export async function ensureTriggerRegions(want: backend.Backend): Promise<void> {
  const regionLookups: Array<Promise<void>> = [];

  for (const ep of backend.allEndpoints(want)) {
    if (ep.platform === "gcfv1" || !backend.isEventTriggered(ep)) {
      continue;
    }
    regionLookups.push(serviceForEndpoint(ep).ensureTriggerRegion(ep));
  }
  await Promise.all(regionLookups);
}

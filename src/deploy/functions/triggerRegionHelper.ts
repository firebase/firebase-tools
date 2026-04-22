import * as backend from "./backend";
import { serviceForEndpoint } from "./services";
import * as utils from "../../utils";

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

  // Warn if an event function defaults to or is assigned to us-central1 but its trigger is elsewhere,
  // to avoid unnecessary cross-region network hops. We ignore nam5 since it covers us-central1.
  for (const ep of backend.allEndpoints(want)) {
    if (
      ep.region === "us-central1" &&
      backend.isEventTriggered(ep) &&
      ep.eventTrigger?.region &&
      ep.eventTrigger.region !== "us-central1" &&
      ep.eventTrigger.region !== "nam5"
    ) {
      utils.logLabeledWarning(
        "functions",
        `Function ${ep.id} located in us-central1 uses a trigger located in ${ep.eventTrigger.region}. ` +
          `To avoid unnecessary cross-region network hops, you should explicitly assign this function to ${ep.eventTrigger.region}.`,
      );
    }
  }
}

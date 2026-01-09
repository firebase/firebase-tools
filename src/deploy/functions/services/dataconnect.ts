import * as backend from "../backend";
import { dataconnectOrigin } from "../../../api";
import { FirebaseError } from "../../../error";

const AUTOPUSH_DATACONNECT_SA_DOMAIN = "gcp-sa-autopush-dataconnect.iam.gserviceaccount.com";
const STAGING_DATACONNECT_SA_DOMAIN = "gcp-sa-staging-dataconnect.iam.gserviceaccount.com";
const PROD_DATACONNECT_SA_DOMAIN = "gcp-sa-firebasedataconnect.iam.gserviceaccount.com";

/**
 * Sets a Firebase Data Connect event trigger's region to the function region.
 * @param endpoint the database endpoint
 */
export function ensureDataConnectTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<void> {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = endpoint.region;
  }
  if (endpoint.eventTrigger.region !== endpoint.region) {
    throw new FirebaseError(
      "The Firebase Data Connect trigger location must match the function region.",
    );
  }
  return Promise.resolve();
}

/**
 * Gets the P4SA for Firebase Data Connect for the given project number.
 * @param projectNumber project identifier
 */
export function getDataConnectP4SA(projectNumber: string): string {
  const origin = dataconnectOrigin();
  if (origin.includes("autopush")) {
    return `service-${projectNumber}@${AUTOPUSH_DATACONNECT_SA_DOMAIN}`;
  }
  if (origin.includes("staging")) {
    return `service-${projectNumber}@${STAGING_DATACONNECT_SA_DOMAIN}`;
  }
  return `service-${projectNumber}@${PROD_DATACONNECT_SA_DOMAIN}`;
}

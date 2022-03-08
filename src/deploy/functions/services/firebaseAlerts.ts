import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import { getProjectNumber } from "../../../getProjectNumber";
import { FirebaseError } from "../../../error";

export const SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE = "roles/iam.serviceAccountTokenCreator";

/**
 * Finds the required project level IAM bindings for the Pub/Sub service agent
 * If the user enabled Pub/Sub on or before April 8, 2021, then we must enable the token creator role
 * @param projectId project identifier
 * @param existingPolicy the project level IAM policy
 */
export function obtainFirebaseAlertsBindings(
  project: { projectId: string; projectNumber: string },
  existingPolicy: iam.Policy
): Array<iam.Binding> {
  const pubsubServiceAgent = `serviceAccount:service-${project.projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
  let pubsubBinding = existingPolicy.bindings.find(
    (b) => b.role === SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE
  );
  if (!pubsubBinding) {
    pubsubBinding = {
      role: SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
      members: [],
    };
  }
  if (!pubsubBinding.members.find((m) => m === pubsubServiceAgent)) {
    pubsubBinding.members.push(pubsubServiceAgent);
  }
  return [pubsubBinding];
}

/**
 * Sets a Firebase Alerts event trigger's region to 'global' since the service is global
 * @param endpoint the storage endpoint
 * @param eventTrigger the endpoints event trigger
 */
export function ensureFirebaseAlertsTriggerRegion(
  endpoint: backend.Endpoint & backend.EventTriggered
): void {
  if (!endpoint.eventTrigger.region) {
    endpoint.eventTrigger.region = "global";
  }
  if (endpoint.eventTrigger.region !== "global") {
    throw new FirebaseError("A firebase alerts function must have a 'global' trigger location");
  }
}

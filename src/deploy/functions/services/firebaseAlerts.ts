import * as backend from "../backend";
import * as iam from "../../../gcp/iam";
import { getProjectNumber } from "../../../getProjectNumber";
// import { FirebaseError } from "../../../error";

const SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE = "roles/iam.serviceAccountTokenCreator";

/**
 * Finds the required project level IAM bindings for the Cloud Storage service agent
 * @param projectId project identifier
 * @param existingPolicy the project level IAM policy
 */
export async function obtainFireAlertsBindings(
  projectId: string,
  existingPolicy: iam.Policy
): Promise<Array<iam.Binding>> {
  const projectNumber = await getProjectNumber({ projectId });
  const pubsubServiceAgent = `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
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
export async function ensureFirebaseAlertsTriggerRegion(
  endpoint: backend.Endpoint,
  eventTrigger: backend.EventTrigger
): Promise<void> {
  eventTrigger.region = "global";
}

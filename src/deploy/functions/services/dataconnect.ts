import * as backend from "../backend";
import { dataconnectOrigin } from "../../../api";
import { FirebaseError } from "../../../error";
import { iam } from "../../../gcp";

const CLOUD_RUN_INVOKER_ROLE = "roles/cloudrun.invoker";

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

function getServiceAccount(projectNumber: string): string {
  if (dataconnectOrigin().includes("autopush")) {
    return `service-${projectNumber}@gcp-sa-autopush-dataconnect.iam.gserviceaccount.com`;
  }
  if (dataconnectOrigin().includes("staging")) {
    return `service-${projectNumber}@gcp-sa-staging-dataconnect.iam.gserviceaccount.com`;
  }
  return `service-${projectNumber}@gcp-sa-firebasedataconnect.iam.gserviceaccount.com`;
}

/**
 * Finds the required project level IAM bindings for the Firebase Data Connect service agent
 * @param projectNumber project identifier
 */
export async function obtainDataConnectBindings(
  projectNumber: string,
): Promise<Array<iam.Binding>> {
  const dataConnectServiceAgent = `serviceAccount:${getServiceAccount(projectNumber)}`;
  const cloudRunInvokerBinding = {
    role: CLOUD_RUN_INVOKER_ROLE,
    members: [dataConnectServiceAgent],
  };
  return [cloudRunInvokerBinding];
}

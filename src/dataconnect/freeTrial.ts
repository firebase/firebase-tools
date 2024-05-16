import { listInstances } from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";

export function freeTrialTermsLink(): string {
  return "https://firebase.google.com/pricing";
}

// Checks whether there is already a free trial instance on a project.
export async function checkForFreeTrialInstance(projectId: string): Promise<string | undefined> {
  const instances = await listInstances(projectId);
  return instances.find((i) => i.settings.userLabels?.["firebase-data-connect"] === "ft")?.name;
}

export function printFreeTrialUnavailable(projectId: string, instanceId: string) {
  const message =
    `Project '${projectId}' already has a CloudSQL instance '${instanceId}' on the Firebase Data Connect free trial. ` +
    "The free trial only includes one CloudSQL instance. " +
    `Consider using a separate database on ${instanceId}, or creating a new CloudSQL instance at ` +
    "https://console.cloud.google.com/sql/instances";
  utils.logLabeledError("dataconnect", message);
}

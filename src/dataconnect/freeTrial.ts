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

export function printFreeTrialUnavailable(
  projectId: string,
  instanceId: string,
  configYamlPath: string,
) {
  const message =
    `Project '${projectId} already has a CloudSQL instance '${instanceId}' on the Firebase Data Connect no-cost trial.` +
    `To use a different database in the same instance, change the instanceId to "${instanceId}" in` +
    `${configYamlPath}. Also, update the database field (i.e. the database name in the instance) as needed.` +
    `(Or you may create a new (paid) CloudSQL instance at https://console.cloud.google.com/sql/instances )`;
  utils.logLabeledError("dataconnect", message);
}

import { listInstances } from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import * as clc from "colorette";

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
  utils.logLabeledError(
    "dataconnect",
    `Project '${projectId} already has a CloudSQL instance '${instanceId}' on the Firebase Data Connect no-cost trial.`,
  );
  const reuseHint =
    `To use a different database in the same instance, ${clc.bold(`change the ${clc.blue("instanceId")} to "${instanceId}"`)} in ` +
    `${clc.green(configYamlPath)}. (Also, update the ${clc.blue("database")} field (i.e. DB name in the instance) ` +
    `and ${clc.blue("location")} as needed.)`;
  utils.logLabeledBullet("dataconnect", reuseHint);
  utils.logLabeledBullet(
    "dataconnect",
    `Or you may create a new (paid) CloudSQL instance at https://console.cloud.google.com/sql/instances`,
  );
}

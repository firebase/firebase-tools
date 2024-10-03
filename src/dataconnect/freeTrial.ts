import { queryTimeSeries, CmQuery } from "../gcp/cloudmonitoring";
import { listInstances } from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import * as clc from "colorette";

export function freeTrialTermsLink(): string {
  return "https://firebase.google.com/pricing";
}

const FREE_TRIAL_METRIC = "sqladmin.googleapis.com/fdc_lifetime_free_trial_per_project";

// Checks whether there is already a free trial instance on a project.
export async function checkFreeTrialInstanceEligibility(projectId: string): Promise<boolean> {

  const query: CmQuery = {
    filter:`metric.type="${FREE_TRIAL_METRIC}"`,
  };
  const ts = await queryTimeSeries(query, projectId);
  console.log(ts);
  return false;
}

export async function getFreeTrialInstanceId(projectId: string): Promise<string | undefined> {
  const instances = await listInstances(projectId);
  return instances.find((i) => i.settings.userLabels?.["firebase-data-connect"] === "ft")?.name;
}

export function printFreeTrialUnavailable(
  projectId: string,
  configYamlPath: string,
  instanceId?: string,
) {
  if (!instanceId) {
    utils.logLabeledBullet(
      "data connect",
      "The CloudSQL free trial has already been used on this project."
    );
    utils.logLabeledBullet(
      "data connect",
      `You may create or use a paid CloudSQL instance by visiting https://console.cloud.google.com/sql/instances`,
    );
    return;
  }
  utils.logLabeledError(
    "dataconnect",
    `Project '${projectId} already has a CloudSQL instance '${instanceId}' on the Firebase Data Connect no-cost trial.`,
  );
  const reuseHint =
    `To use a different database in the same instance, ${clc.bold(`change the ${clc.blue("instanceId")} to "${instanceId}"`)} in ` +
    `${clc.green(configYamlPath)}. (Also, update the ${clc.blue("database")} field (i.e. DB name in the instance) ` +
    `and ${clc.blue("location")} as needed.)`;
  utils.logLabeledBullet("data connect", reuseHint);
  utils.logLabeledBullet(
    "data connect",
    `Or you may create a new (paid) CloudSQL instance at https://console.cloud.google.com/sql/instances`,
  );
}

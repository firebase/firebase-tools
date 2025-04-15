import * as clc from "colorette";

import { queryTimeSeries, CmQuery } from "../gcp/cloudmonitoring";
import { listInstances } from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";

export function freeTrialTermsLink(): string {
  return "https://firebase.google.com/pricing";
}

const FREE_TRIAL_METRIC = "sqladmin.googleapis.com/fdc_lifetime_free_trial_per_project";

// Checks whether there is already a free trial instance on a project.
export async function checkFreeTrialInstanceUsed(projectId: string): Promise<boolean> {
  const past7d = new Date();
  past7d.setDate(past7d.getDate() - 7);
  const query: CmQuery = {
    filter: `metric.type="serviceruntime.googleapis.com/quota/allocation/usage" AND metric.label.quota_metric = "${FREE_TRIAL_METRIC}"`,
    "interval.endTime": new Date().toJSON(),
    "interval.startTime": past7d.toJSON(),
  };
  try {
    const ts = await queryTimeSeries(query, projectId);
    if (ts.length) {
      return ts[0].points.some((p) => p.value.int64Value);
    }
    return true;
  } catch (err: any) {
    // If the metric doesn't exist, free trial is not used.
    return false;
  }
}

export async function getFreeTrialInstanceId(projectId: string): Promise<string | undefined> {
  const instances = await listInstances(projectId);
  return instances.find((i) => i.settings.userLabels?.["firebase-data-connect"] === "ft")?.name;
}

export async function isFreeTrialError(err: any, projectId: string): Promise<boolean> {
  // checkFreeTrialInstanceUsed is also called to ensure the request didn't fail due to an unrelated quota issue.
  return err.message.includes("Quota Exhausted") && (await checkFreeTrialInstanceUsed(projectId))
    ? true
    : false;
}

export function printFreeTrialUnavailable(
  projectId: string,
  configYamlPath: string,
  instanceId?: string,
): void {
  if (!instanceId) {
    utils.logLabeledError(
      "dataconnect",
      "The CloudSQL free trial has already been used on this project.",
    );
    utils.logLabeledError(
      "dataconnect",
      `You may create or use a paid CloudSQL instance by visiting https://console.cloud.google.com/sql/instances`,
    );
    return;
  }
  utils.logLabeledError(
    "dataconnect",
    `Project '${projectId} already has a CloudSQL instance '${instanceId}' on the Firebase Data Connect no-cost trial.`,
  );
  const reuseHint =
    `To use a different database in the same instance, ${clc.bold(`change the ${clc.blue("instanceId")} to "${instanceId}"`)} and update ${clc.blue("location")} in ` +
    `${clc.green(configYamlPath)}.`;

  utils.logLabeledError("dataconnect", reuseHint);
  utils.logLabeledError(
    "dataconnect",
    `Alternatively, you may create a new (paid) CloudSQL instance at https://console.cloud.google.com/sql/instances`,
  );
}

export function upgradeInstructions(projectId: string): string {
  return `If you'd like to provision a CloudSQL Postgres instance on the Firebase Data Connect no-cost trial:
1. Please upgrade to the pay-as-you-go (Blaze) billing plan. Visit the following page:
     https://console.firebase.google.com/project/${projectId}/usage/details
2. Run ${clc.bold("firebase init dataconnect")} again to configure the Cloud SQL instance.
3. Run ${clc.bold("firebase deploy --only dataconnect")} to deploy your Data Connect service.`;
}

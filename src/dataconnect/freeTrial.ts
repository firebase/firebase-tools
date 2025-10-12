import * as clc from "colorette";

import { queryTimeSeries, CmQuery } from "../gcp/cloudmonitoring";
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
  let used = true;
  try {
    const ts = await queryTimeSeries(query, projectId);
    if (ts.length) {
      used = ts[0].points.some((p) => p.value.int64Value);
    }
  } catch (err: any) {
    // If the metric doesn't exist, free trial is not used.
    used = false;
  }
  if (used) {
    utils.logLabeledWarning(
      "dataconnect",
      "CloudSQL no cost trial has already been used on this project.",
    );
  } else {
    utils.logLabeledSuccess("dataconnect", "CloudSQL no cost trial available!");
  }
  return used;
}

export function upgradeInstructions(projectId: string): string {
  return `To provision a paid CloudSQL Postgres instance:

  1. Please upgrade to the pay-as-you-go (Blaze) billing plan. Visit the following page:

      https://console.firebase.google.com/project/${projectId}/usage/details

  2. Run ${clc.bold("firebase deploy --only dataconnect")} to deploy your Data Connect service.`;
}

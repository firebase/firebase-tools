import * as clc from "colorette";

import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { Instance } from "../gcp/cloudsql/types";
import { logger } from "../logger";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { checkFreeTrialInstanceUsed, freeTrialTermsLink } from "./freeTrial";
import { promiseWithSpinner } from "../utils";
import { trackGA4 } from "../track";
import * as utils from "../utils";
import { Source } from "../init/features/dataconnect";
import { checkBillingEnabled } from "../gcp/cloudbilling";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

type SetupStats = {
  action: "get" | "update" | "create";
  databaseVersion?: string;
  dataconnectLabel?: cloudSqlAdminClient.DataConnectLabel;
};

/** Sets up a Cloud SQL instance, database and its permissions. */
export async function setupCloudSql(args: {
  projectId: string;
  location: string;
  instanceId: string;
  databaseId: string;
  requireGoogleMlIntegration: boolean;
  source: Source;
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;

  const startTime = Date.now();
  const stats: SetupStats = { action: "get" };
  let success = false;
  try {
    await upsertInstance(stats, { ...args });
    success = true;
  } finally {
    if (!dryRun) {
      void trackGA4(
        "dataconnect_cloud_sql",
        {
          source: args.source,
          action: success ? stats.action : `${stats.action}_error`,
          location: args.location,
          enable_google_ml_integration: args.requireGoogleMlIntegration.toString(),
          database_version: stats.databaseVersion?.toLowerCase() || "unknown",
          dataconnect_label: stats.dataconnectLabel || "unknown",
        },
        Date.now() - startTime,
      );
    }
  }

  if (requireGoogleMlIntegration && !dryRun) {
    await grantRolesToCloudSqlServiceAccount(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
  }
}

async function upsertInstance(
  stats: SetupStats,
  args: {
    projectId: string;
    location: string;
    instanceId: string;
    databaseId: string;
    requireGoogleMlIntegration: boolean;
    dryRun?: boolean;
  },
): Promise<void> {
  const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    utils.logLabeledBullet(
      "dataconnect",
      `Found existing Cloud SQL instance ${clc.bold(instanceId)}.`,
    );
    stats.databaseVersion = existingInstance.databaseVersion;
    stats.dataconnectLabel =
      (existingInstance.settings?.userLabels?.[
        "firebase-data-connect"
      ] as cloudSqlAdminClient.DataConnectLabel) || "absent";

    const why = getUpdateReason(existingInstance, requireGoogleMlIntegration);
    if (why) {
      if (dryRun) {
        utils.logLabeledBullet(
          "dataconnect",
          `Cloud SQL instance ${clc.bold(instanceId)} settings are not compatible with Firebase Data Connect. ` +
            `It will be updated on your next deploy.` +
            why,
        );
      } else {
        utils.logLabeledBullet(
          "dataconnect",
          `Cloud SQL instance ${clc.bold(instanceId)} settings are not compatible with Firebase Data Connect. ` +
            why,
        );
        stats.action = "update";
        await promiseWithSpinner(
          () =>
            cloudSqlAdminClient.updateInstanceForDataConnect(
              existingInstance,
              requireGoogleMlIntegration,
            ),
          "Updating your Cloud SQL instance...",
        );
      }
    }
    await upsertDatabase({ ...args });
  } catch (err: any) {
    if (err.status !== 404) {
      throw err;
    }
    // Cloud SQL instance is not found, start its creation.
    stats.action = "create";
    stats.databaseVersion = cloudSqlAdminClient.DEFAULT_DATABASE_VERSION;
    const freeTrialUsed = await checkFreeTrialInstanceUsed(projectId);
    stats.dataconnectLabel = freeTrialUsed ? "nt" : "ft";
    await createInstance({ ...args, freeTrialLabel: stats.dataconnectLabel });
  }
}

async function createInstance(args: {
  projectId: string;
  location: string;
  instanceId: string;
  requireGoogleMlIntegration: boolean;
  freeTrialLabel: cloudSqlAdminClient.DataConnectLabel;
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, location, instanceId, requireGoogleMlIntegration, dryRun, freeTrialLabel } =
    args;
  if (dryRun) {
    utils.logLabeledBullet(
      "dataconnect",
      `Cloud SQL Instance ${clc.bold(instanceId)} not found. It will be created on your next deploy.`,
    );
  } else {
    await cloudSqlAdminClient.createInstance({
      projectId,
      location,
      instanceId,
      enableGoogleMlIntegration: requireGoogleMlIntegration,
      freeTrialLabel,
    });
    utils.logLabeledBullet(
      "dataconnect",
      cloudSQLBeingCreated(
        projectId,
        instanceId,
        freeTrialLabel === "ft",
        await checkBillingEnabled(projectId),
      ),
    );
  }
}

/**
 * Returns a message indicating that a Cloud SQL instance is being created.
 */
export function cloudSQLBeingCreated(
  projectId: string,
  instanceId: string,
  isFreeTrial?: boolean,
  billingEnabled?: boolean,
): string {
  return (
    `Cloud SQL Instance ${clc.bold(instanceId)} is being created.` +
    (isFreeTrial
      ? `\nThis instance is provided under the terms of the Data Connect no-cost trial ${freeTrialTermsLink()}`
      : "") +
    `\n
   Meanwhile, your data are saved in a temporary database and will be migrated once complete.` +
    (isFreeTrial && !billingEnabled
      ? ` 
   Your free trial instance won't show in google cloud console until a billing account is added.
   However, you can still use the gcloud cli to monitor your database instance:\n\n\te.g. gcloud sql instances list --project ${projectId}\n`
      : ` 
   Monitor its progress at\n\n\t${cloudSqlAdminClient.instanceConsoleLink(projectId, instanceId)}\n`)
  );
}

async function upsertDatabase(args: {
  projectId: string;
  instanceId: string;
  databaseId: string;
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, instanceId, databaseId, dryRun } = args;
  try {
    await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
    utils.logLabeledBullet("dataconnect", `Found existing Postgres Database ${databaseId}.`);
  } catch (err: any) {
    if (err.status !== 404) {
      // Skip it if the database is not accessible.
      // Possible that the CSQL instance is in the middle of something.
      logger.debug(`Unexpected error from Cloud SQL: ${err}`);
      utils.logLabeledWarning("dataconnect", `Postgres Database ${databaseId} is not accessible.`);
      return;
    }
    if (dryRun) {
      utils.logLabeledBullet(
        "dataconnect",
        `Postgres Database ${databaseId} not found. It will be created on your next deploy.`,
      );
    } else {
      await cloudSqlAdminClient.createDatabase(projectId, instanceId, databaseId);
      utils.logLabeledBullet("dataconnect", `Postgres Database ${databaseId} created.`);
    }
  }
}

/**
 * Validate that existing Cloud SQL instances have the necessary settings.
 */
export function getUpdateReason(instance: Instance, requireGoogleMlIntegration: boolean): string {
  let reason = "";
  const settings = instance.settings;
  if (!settings.ipConfiguration?.ipv4Enabled) {
    utils.logLabeledWarning(
      "dataconnect",
      `Cloud SQL instance ${clc.bold(instance.name)} does not have a public IP.
    ${clc.bold("firebase dataconnect:sql:migrate")} will only work within its VPC (e.g. GCE, GKE).`,
    );
    if (
      settings.ipConfiguration?.privateNetwork &&
      !settings.ipConfiguration?.enablePrivatePathForGoogleCloudServices
    ) {
      // Cloud SQL instances with only private IP must enable PSC for Data Connect backend to connect to it.
      reason += "\n - to enable Private Path for Google Cloud Services.";
    }
  }

  if (requireGoogleMlIntegration) {
    if (!settings.enableGoogleMlIntegration) {
      reason += "\n - to enable Google ML integration.";
    }
    if (
      !settings.databaseFlags?.some(
        (f) => f.name === "cloudsql.enable_google_ml_integration" && f.value === "on",
      )
    ) {
      reason += "\n - to enable Google ML integration database flag.";
    }
  }

  // Cloud SQL instances must have IAM authentication enabled to be used with Firebase Data Connect.
  const isIamEnabled =
    settings.databaseFlags?.some(
      (f) => f.name === "cloudsql.iam_authentication" && f.value === "on",
    ) ?? false;
  if (!isIamEnabled) {
    reason += "\n - to enable IAM authentication database flag.";
  }

  return reason;
}

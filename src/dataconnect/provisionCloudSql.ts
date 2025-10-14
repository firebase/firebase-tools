import * as clc from "colorette";

import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { Instance } from "../gcp/cloudsql/types";
import { logger } from "../logger";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { checkFreeTrialInstanceUsed, freeTrialTermsLink } from "./freeTrial";
import { promiseWithSpinner } from "../utils";
import { trackGA4 } from "../track";
import * as utils from "../utils";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

/** Sets up a Cloud SQL instance, database and its permissions. */
export async function setupCloudSql(args: {
  projectId: string;
  location: string;
  instanceId: string;
  databaseId: string;
  requireGoogleMlIntegration: boolean;
  source: "init" | "mcp_init" | "deploy";
  dryRun?: boolean;
}): Promise<void> {
  const startTime = Date.now();
  await upsertInstance({ ...args, startTime });
  const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
  if (requireGoogleMlIntegration && !dryRun) {
    await grantRolesToCloudSqlServiceAccount(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
  }
}

async function upsertInstance(args: {
  projectId: string;
  location: string;
  instanceId: string;
  databaseId: string;
  requireGoogleMlIntegration: boolean;
  source: "init" | "mcp_init" | "deploy";
  dryRun?: boolean;
  startTime: number;
}): Promise<void> {
  const { projectId, instanceId, requireGoogleMlIntegration, dryRun, source, location, startTime } =
    args;
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    utils.logLabeledBullet(
      "dataconnect",
      `Found existing Cloud SQL instance ${clc.bold(instanceId)}.`,
    );
    const duration = Date.now() - startTime;
    void trackGA4(
      "dataconnect_cloud_sql",
      {
        source: source,
        action: "get",
        location: location,
        enable_google_ml_integration: requireGoogleMlIntegration.toString(),
        result: "success",
        free_trial: "false", // existing instance can't be a new free trial one
        database_version: "postgres_17",
      },
      duration,
    );
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
        try {
          await promiseWithSpinner(
            () =>
              cloudSqlAdminClient.updateInstanceForDataConnect(
                existingInstance,
                requireGoogleMlIntegration,
              ),
            "Updating your Cloud SQL instance...",
          );
          const duration = Date.now() - startTime;
          void trackGA4(
            "dataconnect_cloud_sql",
            {
              source: source,
              action: "updated",
              location: location,
              enable_google_ml_integration: requireGoogleMlIntegration.toString(),
              result: "success",
              free_trial: "false",
              database_version: "postgres_17",
            },
            duration,
          );
        } catch (err) {
          const duration = Date.now() - startTime;
          void trackGA4(
            "dataconnect_cloud_sql",
            {
              source: source,
              action: "updated_failed",
              location: location,
              enable_google_ml_integration: requireGoogleMlIntegration.toString(),
              result: "error",
              free_trial: "false",
              database_version: "postgres_17",
            },
            duration,
          );
          throw err;
        }
      }
    }
    await upsertDatabase({ ...args });
  } catch (err: any) {
    if (err.status !== 404) {
      const duration = Date.now() - startTime;
      void trackGA4(
        "dataconnect_cloud_sql",
        {
          source: source,
          action: "get",
          location: location,
          enable_google_ml_integration: requireGoogleMlIntegration.toString(),
          result: "error",
          free_trial: "false",
          database_version: "postgres_17",
        },
        duration,
      );
      throw err;
    }
    // Cloud SQL instance is not found, start its creation.
    await createInstance({ ...args });
  }
}

async function createInstance(args: {
  projectId: string;
  location: string;
  instanceId: string;
  requireGoogleMlIntegration: boolean;
  source: "init" | "mcp_init" | "deploy";
  dryRun?: boolean;
  startTime: number;
}): Promise<void> {
  const { projectId, location, instanceId, requireGoogleMlIntegration, dryRun, source, startTime } =
    args;
  const freeTrialUsed = await checkFreeTrialInstanceUsed(projectId);
  if (dryRun) {
    utils.logLabeledBullet(
      "dataconnect",
      `Cloud SQL Instance ${clc.bold(instanceId)} not found. It will be created on your next deploy.`,
    );
  } else {
    try {
      await cloudSqlAdminClient.createInstance({
        projectId,
        location,
        instanceId,
        enableGoogleMlIntegration: requireGoogleMlIntegration,
        freeTrial: !freeTrialUsed,
      });
      const duration = Date.now() - startTime;
      void trackGA4(
        "dataconnect_cloud_sql",
        {
          source: source,
          action: "created",
          location: location,
          enable_google_ml_integration: requireGoogleMlIntegration.toString(),
          result: "success",
          free_trial: (!freeTrialUsed).toString(),
          database_version: "postgres_17",
        },
        duration,
      );
      utils.logLabeledBullet(
        "dataconnect",
        cloudSQLBeingCreated(projectId, instanceId, !freeTrialUsed),
      );
    } catch (err) {
      const duration = Date.now() - startTime;
      void trackGA4(
        "dataconnect_cloud_sql",
        {
          source: source,
          action: "created_failed",
          location: location,
          enable_google_ml_integration: requireGoogleMlIntegration.toString(),
          result: "error",
          free_trial: (!freeTrialUsed).toString(),
          database_version: "postgres_17",
        },
        duration,
      );
      throw err;
    }
  }
}

/**
 * Returns a message indicating that a Cloud SQL instance is being created.
 */
export function cloudSQLBeingCreated(
  projectId: string,
  instanceId: string,
  includeFreeTrialToS?: boolean,
): string {
  return (
    `Cloud SQL Instance ${clc.bold(instanceId)} is being created.` +
    (includeFreeTrialToS
      ? `\nThis instance is provided under the terms of the Data Connect no-cost trial ${freeTrialTermsLink()}`
      : "") +
    `
   Meanwhile, your data are saved in a temporary database and will be migrated once complete. Monitor its progress at

   ${cloudSqlAdminClient.instanceConsoleLink(projectId, instanceId)}
`
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

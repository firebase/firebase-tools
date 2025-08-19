import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { Instance } from "../gcp/cloudsql/types";
import { promiseWithSpinner } from "../utils";
import { logger } from "../logger";
import { freeTrialTermsLink, checkFreeTrialInstanceUsed } from "./freeTrial";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

export async function provisionCloudSql(args: {
  projectId: string;
  location: string;
  instanceId: string;
  databaseId: string;
  requireGoogleMlIntegration: boolean;
  dryRun?: boolean;
}): Promise<string | undefined> {
  try {
    const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    utils.logLabeledBullet("dataconnect", `Found existing Cloud SQL instance ${instanceId}.`);
    const why = getUpdateReason(existingInstance, requireGoogleMlIntegration);
    if (why) {
      if (dryRun) {
        utils.logLabeledBullet(
          "dataconnect",
          `Cloud SQL instance ${instanceId} settings not compatible with Firebase Data Connect. ` +
            `It will be updated on your next deploy.` +
            why,
        );
      } else {
        utils.logLabeledBullet(
          "dataconnect",
          `Cloud SQL instance ${instanceId} settings not compatible with Firebase Data Connect. ` +
            `Updating Cloud SQL instance. This may take a few minutes...` +
            why,
        );
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
    await provisionCloudSQLDatabase({ ...args });
    if (requireGoogleMlIntegration && !dryRun) {
      await grantRolesToCloudSqlServiceAccount(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
    }
    return existingInstance.connectionName || "";
  } catch (err: any) {
    // We only should catch NOT FOUND errors
    if (err.status !== 404) {
      throw err;
    }
    await createCloudSQL({ ...args });
  }
}

async function createCloudSQL(args: {
  projectId: string;
  location: string;
  instanceId: string;
  requireGoogleMlIntegration: boolean;
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, location, instanceId, requireGoogleMlIntegration, dryRun } = args;
  const freeTrialUsed = await checkFreeTrialInstanceUsed(projectId);
  if (dryRun) {
    utils.logLabeledBullet(
      "dataconnect",
      `CloudSQL instance '${instanceId}' not found. It will be created on your next deploy.`,
    );
  } else {
    utils.logLabeledBullet(
      "dataconnect",
      `CloudSQL instance '${instanceId}' not found. Creating it now...` +
        (freeTrialUsed
          ? ""
          : `\nThis instance is provided under the terms of the Data Connect no-cost trial ${freeTrialTermsLink()}`) +
        `\nMonitor the progress at ${cloudSqlAdminClient.instanceConsoleLink(projectId, instanceId)}`,
    );
    await cloudSqlAdminClient.createInstance({
      projectId,
      location,
      instanceId,
      enableGoogleMlIntegration: requireGoogleMlIntegration,
      freeTrial: !freeTrialUsed,
    });
    utils.logLabeledBullet(
      "dataconnect",
      "Cloud SQL instance creation started. Meanwhile, your data are saved in a temporary database and will be migrated once complete.",
    );
  }
}

async function provisionCloudSQLDatabase(args: {
  projectId: string;
  instanceId: string;
  databaseId: string;
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, instanceId, databaseId, dryRun } = args;
  try {
    await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
    utils.logLabeledBullet("dataconnect", `Found existing database ${databaseId}.`);
  } catch (err: any) {
    if (err.status !== 404) {
      // Skip it if the database is not accessible.
      // Possible that the CSQL instance is in the middle of something.
      logger.debug(`Unexpected error from CloudSQL: ${err}`);
      utils.logLabeledWarning("dataconnect", `Database ${databaseId} is not accessible.`);
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
 * Validate that existing CloudSQL instances have the necessary settings.
 */
export function getUpdateReason(instance: Instance, requireGoogleMlIntegration: boolean): string {
  let reason = "";
  const settings = instance.settings;
  // CloudSQL instances must have public IP enabled to be used with Firebase Data Connect.
  if (!settings.ipConfiguration?.ipv4Enabled) {
    reason += "\n - to enable public IP.";
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

  // CloudSQL instances must have IAM authentication enabled to be used with Firebase Data Connect.
  const isIamEnabled =
    settings.databaseFlags?.some(
      (f) => f.name === "cloudsql.iam_authentication" && f.value === "on",
    ) ?? false;
  if (!isIamEnabled) {
    reason += "\n - to enable IAM authentication database flag.";
  }

  return reason;
}

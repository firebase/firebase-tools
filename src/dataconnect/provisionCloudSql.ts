import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { Instance } from "../gcp/cloudsql/types";
import { promiseWithSpinner } from "../utils";
import { logger } from "../logger";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

import {
  getFreeTrialInstanceId,
  freeTrialTermsLink,
  printFreeTrialUnavailable,
  checkFreeTrialInstanceUsed,
} from "./freeTrial";
import { FirebaseError } from "../error";

export async function provisionCloudSql(args: {
  projectId: string;
  locationId: string;
  instanceId: string;
  databaseId: string;
  configYamlPath: string;
  enableGoogleMlIntegration: boolean;
  waitForCreation: boolean;
  silent?: boolean;
  dryRun?: boolean;
}): Promise<string> {
  let connectionName = ""; // Not used yet, will be used for schema migration
  const {
    projectId,
    locationId,
    instanceId,
    databaseId,
    configYamlPath,
    enableGoogleMlIntegration,
    waitForCreation,
    silent,
    dryRun,
  } = args;
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing instance ${instanceId}.`);
    connectionName = existingInstance?.connectionName || "";
    const why = getUpdateReason(existingInstance, enableGoogleMlIntegration);
    if (why) {
      const cta = dryRun
        ? `It will be updated on your next deploy.`
        : `Updating instance. This may take a few minutes...`;
      silent ||
        utils.logLabeledBullet(
          "dataconnect",
          `Instance ${instanceId} settings not compatible with Firebase Data Connect. ` + cta + why,
        );
      if (!dryRun) {
        await promiseWithSpinner(
          () =>
            cloudSqlAdminClient.updateInstanceForDataConnect(
              existingInstance,
              enableGoogleMlIntegration,
            ),
          "Updating your instance...",
        );
        silent || utils.logLabeledBullet("dataconnect", "Instance updated");
      }
    }
  } catch (err: any) {
    // We only should catch NOT FOUND errors
    if (err.status !== 404) {
      throw err;
    }
    const freeTrialInstanceId = await getFreeTrialInstanceId(projectId);
    if (await checkFreeTrialInstanceUsed(projectId)) {
      printFreeTrialUnavailable(projectId, configYamlPath, freeTrialInstanceId);
      throw new FirebaseError("No-cost Cloud SQL trial has already been used on this project.");
    }
    const cta = dryRun ? "It will be created on your next deploy" : "Creating it now.";
    silent ||
      utils.logLabeledBullet(
        "dataconnect",
        `CloudSQL instance '${instanceId}' not found.` +
          cta +
          `\nThis instance is provided under the terms of the Data Connect no-cost trial ${freeTrialTermsLink()}` +
          `\nMonitor the progress at ${cloudSqlAdminClient.instanceConsoleLink(projectId, instanceId)}`,
      );
    if (!dryRun) {
      const newInstance = await promiseWithSpinner(
        () =>
          cloudSqlAdminClient.createInstance(
            projectId,
            locationId,
            instanceId,
            enableGoogleMlIntegration,
            waitForCreation,
          ),
        "Creating your instance...",
      );
      if (newInstance) {
        silent || utils.logLabeledBullet("dataconnect", "Instance created");
        connectionName = newInstance?.connectionName || "";
      } else {
        silent ||
          utils.logLabeledBullet(
            "dataconnect",
            "Cloud SQL instance creation started - it should be ready shortly. Database and users will be created on your next deploy.",
          );
        return connectionName;
      }
    }
  }

  try {
    await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing database ${databaseId}.`);
  } catch (err: any) {
    if (err.status === 404) {
      if (dryRun) {
        silent ||
          utils.logLabeledBullet(
            "dataconnect",
            `Database ${databaseId} not found. It will be created on your next deploy.`,
          );
      } else {
        // Create the database if not found.
        silent ||
          utils.logLabeledBullet(
            "dataconnect",
            `Database ${databaseId} not found, creating it now...`,
          );
        await cloudSqlAdminClient.createDatabase(projectId, instanceId, databaseId);
        silent || utils.logLabeledBullet("dataconnect", `Database ${databaseId} created.`);
      }
    } else {
      // Skip it if the database is not accessible.
      // Possible that the CSQL instance is in the middle of something.
      logger.debug(`Unexpected error from CloudSQL: ${err}`);
      silent || utils.logLabeledWarning("dataconnect", `Database ${databaseId} is not accessible.`);
    }
  }
  if (enableGoogleMlIntegration && !dryRun) {
    await grantRolesToCloudSqlServiceAccount(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
  }
  return connectionName;
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

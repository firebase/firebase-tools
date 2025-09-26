import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import * as clc from "colorette";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { Instance } from "../gcp/cloudsql/types";
import { promiseWithSpinner } from "../utils";
import { logger } from "../logger";
import { freeTrialTermsLink, checkFreeTrialInstanceUsed } from "./freeTrial";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

/** Sets up a Cloud SQL instance, database and its permissions. */
export async function setupCloudSql(args: {
  projectId: string;
  location: string;
  instanceId: string;
  databaseId: string;
  requireGoogleMlIntegration: boolean;
  dryRun?: boolean;
}): Promise<void> {
  await upsertInstance({ ...args });
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
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, instanceId, requireGoogleMlIntegration, dryRun } = args;
  try {
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
    await upsertDatabase({ ...args });
  } catch (err: any) {
    if (err.status !== 404) {
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
  dryRun?: boolean;
}): Promise<void> {
  const { projectId, location, instanceId, requireGoogleMlIntegration, dryRun } = args;
  const freeTrialUsed = await checkFreeTrialInstanceUsed(projectId);
  if (dryRun) {
    utils.logLabeledBullet(
      "dataconnect",
      `Cloud SQL Instance ${instanceId} not found. It will be created on your next deploy.`,
    );
  } else {
    await cloudSqlAdminClient.createInstance({
      projectId,
      location,
      instanceId,
      enableGoogleMlIntegration: requireGoogleMlIntegration,
      freeTrial: !freeTrialUsed,
    });
    utils.logLabeledBullet(
      "dataconnect",
      cloudSQLBeingCreated(projectId, instanceId, !freeTrialUsed),
    );
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
    `Cloud SQL Instance ${instanceId} is being created.` +
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
  // Cloud SQL instances must have public IP enabled to be used with Firebase Data Connect.
  if (!settings.ipConfiguration?.ipv4Enabled) {
    utils.logLabeledWarning(
      "dataconnect",
      `Cloud SQL instance ${clc.bold(instance.name)} does not have a public IP.
    ${clc.bold("firebase dataconnect:sql:migrate")} will only work within its VPC (e.g. GCE, GKE).`,
    );
    if (!settings.ipConfiguration?.pscConfig?.pscEnabled) {
      reason += "\n - to enable VPC private service connection for Google Cloud Services.";
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

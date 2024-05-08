import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";
import { Instance } from "../gcp/cloudsql/types";
import { promiseWithSpinner } from "../utils";

const GOOGLE_ML_INTEGRATION_ROLE = "roles/aiplatform.user";

import {
  checkForFreeTrialInstance,
  freeTrialTermsLink,
  printFreeTrialUnavailable,
} from "./freeTrial";
import { FirebaseError } from "../error";

export async function provisionCloudSql(args: {
  projectId: string;
  locationId: string;
  instanceId: string;
  databaseId: string;
  enableGoogleMlIntegration: boolean;
  silent?: boolean;
}): Promise<string> {
  let connectionName: string; // Not used yet, will be used for schema migration
  const { projectId, locationId, instanceId, databaseId, enableGoogleMlIntegration, silent } = args;
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing instance ${instanceId}.`);
    connectionName = existingInstance?.connectionName || "";
    if (!checkInstanceConfig(existingInstance, enableGoogleMlIntegration)) {
      // TODO: Return message from checkInstanceConfig to explain exactly what changes are made
      silent ||
        utils.logLabeledBullet(
          "dataconnect",
          `Instance ${instanceId} settings not compatible with Firebase Data Connect. ` +
            `Updating instance to enable Cloud IAM authentication and public IP. This may take a few minutes...`,
        );
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
  } catch (err: any) {
    // We only should catch NOT FOUND errors
    if (err.status !== 404) {
      throw err;
    }
    const freeTrialInstanceId = await checkForFreeTrialInstance(projectId);
    if (freeTrialInstanceId) {
      printFreeTrialUnavailable(projectId, freeTrialInstanceId);
      throw new FirebaseError("Free trial unavailable.");
    }
    silent ||
      utils.logLabeledBullet(
        "dataconnect",
        `CloudSQL instance '${instanceId}' not found, creating it. This instance is provided under the terms of the Data Connect free trial ${freeTrialTermsLink()}`,
      );
    silent || utils.logLabeledBullet("dataconnect", `This may take while...`);
    const newInstance = await promiseWithSpinner(
      () =>
        cloudSqlAdminClient.createInstance(
          projectId,
          locationId,
          instanceId,
          enableGoogleMlIntegration,
        ),
      "Creating your instance...",
    );
    silent || utils.logLabeledBullet("dataconnect", "Instance created");
    connectionName = newInstance?.connectionName || "";
  }
  try {
    await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing database ${databaseId}.`);
  } catch (err) {
    silent ||
      utils.logLabeledBullet("dataconnect", `Database ${databaseId} not found, creating it now...`);
    await cloudSqlAdminClient.createDatabase(projectId, instanceId, databaseId);
    silent || utils.logLabeledBullet("dataconnect", `Database ${databaseId} created.`);
  }
  if (enableGoogleMlIntegration) {
    await grantRolesToCloudSqlServiceAccount(projectId, instanceId, [GOOGLE_ML_INTEGRATION_ROLE]);
  }
  return connectionName;
}

/**
 * Validate that existing CloudSQL instances have the necessary settings.
 */
export function checkInstanceConfig(
  instance: Instance,
  requireGoogleMlIntegration: boolean,
): boolean {
  const settings = instance.settings;
  // CloudSQL instances must have public IP enabled to be used with Firebase Data Connect.
  if (!settings.ipConfiguration?.ipv4Enabled) {
    return false;
  }

  if (requireGoogleMlIntegration) {
    if (!settings.enableGoogleMlIntegration) {
      return false;
    }
    if (
      !settings.databaseFlags?.some(
        (f) => f.name === "cloudsql.enable_google_ml_integration" && f.value === "on",
      )
    ) {
      return false;
    }
  }

  // CloudSQL instances must have IAM authentication enabled to be used with Firebase Data Connect.
  const isIamEnabled =
    settings.databaseFlags?.some(
      (f) => f.name === "cloudsql.iam_authentication" && f.value === "on",
    ) ?? false;

  return isIamEnabled;
}

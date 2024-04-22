import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { execute } from "../gcp/cloudsql/connect";
import * as utils from "../utils";
import {
  checkForFreeTrialInstance,
  freeTrialTermsLink,
  printFreeTrialUnavailable,
} from "./freeTrial";
import { FirebaseError } from "../error";

export async function provisionCloudSql(
  projectId: string,
  locationId: string,
  instanceId: string,
  databaseId: string,
  silent = false,
): Promise<string> {
  let connectionName: string;
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing instance ${instanceId}.`);
    connectionName = existingInstance?.connectionName || "";
    if (!cloudSqlAdminClient.isValidInstanceForDataConnect(existingInstance)) {
      silent ||
        utils.logLabeledBullet(
          "dataconnect",
          `Instance ${instanceId} not compatible with Firebase Data Connect. Updating instance to enable Cloud IAM authentication and public IP. This may take a few minutes...`,
        );
      await cloudSqlAdminClient.updateInstanceForDataConnect(existingInstance);
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
    const newInstance = await cloudSqlAdminClient.createInstance(projectId, locationId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", "Instance created");
    // TODO: Why is connectionName not populated
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
  return connectionName;
}

export const REQUIRED_EXTENSIONS_COMMANDS = [
  `CREATE SCHEMA IF NOT EXISTS "public"`,
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" with SCHEMA public`,
  `CREATE EXTENSION IF NOT EXISTS "vector" with SCHEMA public`,
  `CREATE EXTENSION IF NOT EXISTS "google_ml_integration" with SCHEMA public CASCADE`,
];
// TODO: This should not be hardcoded, instead should be returned during schema migration
export async function installRequiredExtensions(
  projectId: string,
  instanceId: string,
  databaseId: string,
  username: string,
) {
  await execute(REQUIRED_EXTENSIONS_COMMANDS, {
    projectId,
    instanceId,
    databaseId,
    username,
    silent: true,
  });
}

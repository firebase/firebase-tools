import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import * as utils from "../utils";

export async function provisionCloudSql(
  projectId: string,
  locationId: string,
  instanceId: string,
  databaseId: string,
  silent: boolean = false,
): Promise<string | undefined> {
  let connectionName: string; // Not used yet, will be used for schema migration
  try {
    const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", `Found existing instance ${instanceId}.`);
    connectionName = existingInstance.connectionName!;
  } catch (err) {
    silent ||
      utils.logLabeledBullet(
        "dataconnect",
        `Instance ${instanceId} not found, creating it now. This may take a few minutes...`,
      );
    const newInstance = await cloudSqlAdminClient.createInstance(projectId, locationId, instanceId);
    silent || utils.logLabeledBullet("dataconnect", "Instance created");
    connectionName = newInstance.connectionName!;
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

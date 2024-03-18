import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as cloudSqlAdminClient from "../gcp/cloudsql/cloudsqladmin";
import { executeAsIAMUser, setupIAMUser } from "../gcp/cloudsql/connect";
import { logger } from "../logger";
import { requireAuth } from "../requireAuth";
import { promptOnce } from "../prompt";

// Using this command temporarily for testing out connections. Will probably need to remove or hide this before release.
export const command = new Command("dataconnect:connect")
  .description("For testing purposes only. Connect to a cloudSQL postgres db")
  .before(requireAuth)
  // .before(requirePermissions, ["dataconnect.services.list", "dataconnect.schemas.list", "dataconnect.connectors.list"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    const instanceId = await promptOnce({
      message: "Enter CloudSQL instance ID to use. If it does not exist, it will be created.",
      type: "input",
      default: "my-cli-instance",
    });
    const databaseId = await promptOnce({
      message: "Enter CloudSQL database ID to use. If it does not exist, it will be created.",
      type: "input",
      default: "test-db",
    });
    let connectionName: string;
    try {
      const existingInstance = await cloudSqlAdminClient.getInstance(projectId, instanceId);
      logger.info("Found existing instance.");
      connectionName = existingInstance.connectionName!;
    } catch (err) {
      logger.info("Instance not found, creating it now...");
      const newInstance = await cloudSqlAdminClient.createInstance(
        projectId,
        "us-central1",
        instanceId,
      );
      logger.info("Instance created");
      connectionName = newInstance.connectionName!;
    }
    console.log(connectionName);
    try {
      await cloudSqlAdminClient.getDatabase(projectId, instanceId, databaseId);
      logger.info("Found existing database.");
    } catch (err) {
      logger.info("Database not found, creating it now...");
      await cloudSqlAdminClient.createDatabase(projectId, instanceId, databaseId);
      logger.info("Database created");
    }

    console.log(`Setting up your IAM user...`);
    const iamUser = await setupIAMUser(instanceId, databaseId, connectionName, options);

    await executeAsIAMUser(connectionName, databaseId, iamUser, ["SELECT NOW()"]);
  });

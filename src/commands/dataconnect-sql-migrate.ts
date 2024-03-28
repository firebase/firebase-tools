import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensure } from "../ensureApiEnabled";
import { dataconnectOrigin } from "../api";
import { pickService } from "../dataconnect/fileUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { migrateSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:migrate [serviceId]")
  .description("migrates your CloudSQL database's schema to match your local DataConnect schema")
  // .before(requirePermissions, ["dataconnect.services.list", "dataconnect.schemas.list", "dataconnect.connectors.list"])
  .before(requireAuth)
  .withForce("Execute any required database changes without prompting")
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensure(projectId, new URL(dataconnectOrigin()).hostname, "dataconnect");
    const serviceInfo = await pickService(projectId, options.config, serviceId);
    const instanceId =
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.cloudSql.instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }
    const diffs = await migrateSchema(options, serviceInfo.schema);
    if (diffs.length) {
      logger.info(
        `Schema sucessfully migrated! Run 'firebase deploy' to deploy your new schema to your Data Connect service.`,
      );
    } else {
      logger.info("Schema was already up to date!");
    }
    return { projectId, serviceId, diffs };
  });

import { Command } from "../command.js";
import { Options } from "../options.js";
import { needProjectId } from "../projectUtils.js";
import { pickService } from "../dataconnect/fileUtils.js";
import { FirebaseError } from "../error.js";
import { migrateSchema } from "../dataconnect/schemaMigration.js";
import { requireAuth } from "../requireAuth.js";
import { requirePermissions } from "../requirePermissions.js";
import { ensureApis } from "../dataconnect/ensureApis.js";
import { logLabeledSuccess } from "../utils.js";

export const command = new Command("dataconnect:sql:migrate [serviceId]")
  .description("migrates your CloudSQL database's schema to match your local DataConnect schema")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .withForce("Execute any required database changes without prompting")
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);
    const instanceId =
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.cloudSql.instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }
    const diffs = await migrateSchema({
      options,
      schema: serviceInfo.schema,
      validateOnly: true,
      schemaValidation: serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    });
    if (diffs.length) {
      logLabeledSuccess(
        "dataconnect",
        `Database schema sucessfully migrated! Run 'firebase deploy' to deploy your new schema to your Data Connect service.`,
      );
    } else {
      logLabeledSuccess("dataconnect", "Database schema is already up to date!");
    }
    return { projectId, serviceId, diffs };
  });

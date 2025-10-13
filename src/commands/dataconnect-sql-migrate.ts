import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/load";
import { FirebaseError } from "../error";
import { migrateSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { logLabeledSuccess } from "../utils";

export const command = new Command("dataconnect:sql:migrate")
  .description("migrate your CloudSQL database's schema to match your local Data Connect schema")
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--location <location>", "the location of the Data Connect service to disambiguate")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .withForce("execute any required database changes without prompting")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (!options.service) {
      throw new FirebaseError("Missing required flag --service");
    }
    const serviceId = options.service as string;
    const location = options.location as string;
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId, location);
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

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
import { getResourceFilters } from "../dataconnect/filters";

export const command = new Command("dataconnect:sql:migrate")
  .description("migrate your CloudSQL database's schema to match your local Data Connect schema")
  .option(
    "--only <serviceId>",
    "the service ID to migrate. Supported formats: dataconnect:serviceId, dataconnect:locationId:serviceId",
  )
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
    const filters = getResourceFilters(options);
    let serviceId: string | undefined;
    if (filters) {
      if (filters.length > 1) {
        throw new FirebaseError("Cannot specify more than one service to migrate.", { exit: 1 });
      }
      const f = filters[0];
      if (f.schemaOnly) {
        throw new FirebaseError(
          `--only filter for dataconnect:sql:migrate must be a service ID (e.g. --only dataconnect:my-service)`,
        );
      }
      serviceId = f.connectorId ? `${f.serviceId}:${f.connectorId}` : f.serviceId;
    }
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
    return { projectId, serviceId: serviceInfo.dataConnectYaml.serviceId, diffs };
  });

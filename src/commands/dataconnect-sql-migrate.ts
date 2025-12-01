import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickOneService } from "../dataconnect/load";
import { FirebaseError } from "../error";
import { migrateSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { logLabeledSuccess } from "../utils";
import { mainSchema, mainSchemaYaml } from "../dataconnect/types";

type MigrateOptions = Options & { service?: string; location?: string };

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
  .action(async (options: MigrateOptions) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickOneService(
      projectId,
      options.config,
      options.service,
      options.location,
    );
    const instanceId = mainSchemaYaml(serviceInfo.dataConnectYaml).datasource.postgresql?.cloudSql
      .instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }
    const diffs = await migrateSchema({
      options,
      schema: mainSchema(serviceInfo.schemas),
      validateOnly: true,
      schemaValidation: mainSchemaYaml(serviceInfo.dataConnectYaml).datasource.postgresql
        ?.schemaValidation,
    });
    if (diffs.length) {
      logLabeledSuccess(
        "dataconnect",
        `Database schema sucessfully migrated! Run 'firebase deploy' to deploy your new schema to your Data Connect service.`,
      );
    } else {
      logLabeledSuccess("dataconnect", "Database schema is already up to date!");
    }
    return { projectId, diffs };
  });

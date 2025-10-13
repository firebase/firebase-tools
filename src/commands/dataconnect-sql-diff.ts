import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickOneService } from "../dataconnect/load";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:diff")
  .description(
    "display the differences between the local Data Connect schema and your CloudSQL database's schema",
  )
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--location <location>", "the location of the Data Connect service to disambiguate")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
  ])
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickOneService(
      projectId,
      options.config,
      options.service as string | undefined,
      options.location as string | undefined,
    );

    const diffs = await diffSchema(
      options,
      serviceInfo.schema,
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    );
    return { projectId, diffs };
  });

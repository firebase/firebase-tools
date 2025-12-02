import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickOneService } from "../dataconnect/load";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { mainSchema, mainSchemaYaml } from "../dataconnect/types";

type DiffOptions = Options & { service?: string; location?: string };

export const command = new Command("dataconnect:sql:diff")
  .description(
    "display the differences between the local Data Connect schema and your CloudSQL database's schema",
  )
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option(
    "--location <location>",
    "the location of the Data Connect service. Only needed if service ID is used in multiple locations.",
  )
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
  ])
  .before(requireAuth)
  .action(async (options: DiffOptions) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickOneService(
      projectId,
      options.config,
      options.service,
      options.location,
    );

    const diffs = await diffSchema(
      options,
      mainSchema(serviceInfo.schemas),
      mainSchemaYaml(serviceInfo.dataConnectYaml).datasource.postgresql?.schemaValidation,
    );
    return { projectId, diffs };
  });
